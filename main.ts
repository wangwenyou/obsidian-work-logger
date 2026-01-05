import { App, Modal, Plugin, ItemView, WorkspaceLeaf, TFile, Setting, PluginSettingTab, setIcon, ButtonComponent, Notice, requestUrl, MarkdownRenderer, Component, moment, Editor, MarkdownView } from 'obsidian';
import { t } from './lang';

const VIEW_TYPE_CALENDAR = "work-logger-calendar";

interface WorkLoggerSettings {
    rootFolder: string;
    hoursPerDay: number;
    llmEndpoint: string;
    llmApiKey: string;
    llmModel: string;
    llmPrompt: string;
    llmMonthPrompt: string;
    llmYearPrompt: string;
    defaultStartTime: string;
    defaultEndTime: string;
}

const DEFAULT_SETTINGS: WorkLoggerSettings = {
    rootFolder: 'Timesheets',
    hoursPerDay: 8,
    llmEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    llmApiKey: '',
    llmModel: 'gemini-2.5-flash',
    llmPrompt: t('aiPrompt'),
    llmMonthPrompt: t('aiMonthPrompt'),
    llmYearPrompt: t('aiYearPrompt'),
    defaultStartTime: '09:00',
    defaultEndTime: '18:00',
}

export default class WorkLoggerPlugin extends Plugin {
    settings: WorkLoggerSettings;

    async onload() {
        await this.loadSettings();
        this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));
        this.addRibbonIcon('calendar-with-checkmark', t('openCalendar'), () => {
            void this.activateView();
        });
        this.addSettingTab(new WorkLoggerSettingTab(this.app, this));

        this.addCommand({
            id: 'generate-custom-report',
            name: t('customReportTitle'),
            callback: () => {
                new CustomDateRangeModal(this.app, this).open();
            }
        });

        this.addCommand({
            id: 'open-work-logger-calendar',
            name: t('openCalendar'),
            callback: () => {
                void this.activateView();
            }
        });

        this.addCommand({
            id: 'insert-timed-list-item',
            name: t('insertTimedListItem'),
            editorCallback: (editor: Editor, view: MarkdownView) => {
                const doc = editor.getDoc();
                const cursor = doc.getCursor();
                const line = doc.getLine(cursor.line);

                // Check if we are in a work log file
                if (!view.file || !view.file.path.startsWith(this.settings.rootFolder)) {
                    new Notice("Work Logger: This command only works in work log files.");
                    return;
                }

                const timeStr = moment().format("HH:mm");

                // If the current line is a list item, insert a new line with time below it.
                // Otherwise, just insert it at the cursor.
                if (line.trim().startsWith('-')) {
                    const newText = `\n- ${timeStr} `;
                    editor.replaceRange(newText, { line: cursor.line, ch: line.length });
                    doc.setCursor({ line: cursor.line + 1, ch: newText.length - 1 });
                } else {
                    const newText = `- ${timeStr} `;
                    editor.replaceSelection(newText);
                    doc.setCursor(editor.getCursor());
                }
            }
        });

        // 使用全局键盘事件监听，在捕获阶段拦截
        this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
            // 只处理单独的回车键
            if (evt.key !== 'Enter' || evt.shiftKey || evt.ctrlKey || evt.altKey || evt.metaKey) {
                return;
            }

            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (!activeView || !activeView.file) {
                return;
            }

            // 只在工作日志文件中生效
            if (!activeView.file.path.startsWith(this.settings.rootFolder)) {
                return;
            }

            const editor = activeView.editor;
            const cursor = editor.getCursor();
            const currentLine = editor.getLine(cursor.line);

            // 检查当前行是否是时间格式的列表项，支持多种格式
            const timeEntryRegex = /^-\s*(\d{1,2}:\d{2})(\s+.*)?$/;
            const match = currentLine.match(timeEntryRegex);

            // 如果当前行匹配时间格式且光标在行尾
            if (match && cursor.ch === currentLine.length) {
                evt.preventDefault();
                evt.stopPropagation();

                const timeStr = moment().format("HH:mm");
                const newText = `\n- ${timeStr} `;
                editor.replaceRange(newText, { line: cursor.line, ch: cursor.ch });
                editor.setCursor({ line: cursor.line + 1, ch: newText.length - 1 });
                return;
            }

            // 如果当前行不匹配，检查前一行是否是时间条目
            if (cursor.line > 0) {
                const prevLine = editor.getLine(cursor.line - 1);
                const prevMatch = prevLine.match(timeEntryRegex);

                // 如果前一行是时间条目，且当前行是续行（以空格开头或为空）
                if (prevMatch && (currentLine.trim() === '' || /^\s+/.test(currentLine)) && cursor.ch === currentLine.length) {
                    evt.preventDefault();
                    evt.stopPropagation();

                    const timeStr = moment().format("HH:mm");
                    const newText = `\n- ${timeStr} `;
                    editor.replaceRange(newText, { line: cursor.line, ch: cursor.ch });
                    editor.setCursor({ line: cursor.line + 1, ch: newText.length - 1 });
                    return;
                }
            }
        }, { capture: true });
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async generateCustomReport(startDate: moment.Moment, endDate: moment.Moment) {
        const taskStats: Record<string, number> = {};
        let fullContent = "";

        const days = endDate.diff(startDate, 'days') + 1;

        for (let i = 0; i < days; i++) {
            const date = startDate.clone().add(i, 'days');
            const filePath = this.getFilePath(date);
            const file = this.app.vault.getAbstractFileByPath(filePath);

            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                this.parseDailyContent(content, taskStats);
                fullContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
            }
        }

        new ReportModal(this.app, this, taskStats, startDate, this.settings, fullContent, endDate).open();
    }

    getFilePath(date: moment.Moment): string {
        return `${this.settings.rootFolder}/${date.format('YYYYMM')}/${date.format('DD')}.md`;
    }

    parseDailyContent(content: string, stats: Record<string, number>) {
        const lines = content.split('\n');
        const regex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        interface TaskEntry { time: moment.Moment, title: string }
        const entries: TaskEntry[] = [];

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                entries.push({
                    time: moment(match[1], 'HH:mm'),
                    title: match[2].trim()
                });
            }
        });

        for (let i = 0; i < entries.length - 1; i++) {
            const current = entries[i];
            const next = entries[i + 1];
            const duration = moment.duration(next.time.diff(current.time)).asHours();
            if (duration > 0 && current.title) {
                if (!stats[current.title]) stats[current.title] = 0;
                stats[current.title] += duration;
            }
        }
    }

    async callLLM(content: string, customPrompt?: string): Promise<string> {
        const { llmEndpoint, llmApiKey, llmModel, llmPrompt } = this.settings;
        let url = llmEndpoint;
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.endsWith('chat/completions')) url = `${url}/chat/completions`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (llmApiKey) headers['Authorization'] = `Bearer ${llmApiKey}`;

        const body = {
            model: llmModel,
            messages: [
                { role: 'system', content: customPrompt || llmPrompt },
                { role: 'user', content: content }
            ],
            stream: false
        };

        const response = await requestUrl({
            url: url,
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body)
        });

        if (response.status !== 200) throw new Error(`API Error (${response.status}): ${response.text}`);
        const data = response.json;
        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        }
        else {
            throw new Error("API response invalid: no choices found");
        }
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            await leaf!.setViewState({ type: VIEW_TYPE_CALENDAR, active: true });
        }
        workspace.revealLeaf(leaf!);
    }
}

class CalendarView extends ItemView {
    plugin: WorkLoggerPlugin;
    currentDate: moment.Moment;
    existingDates: Set<string>;
    tasksContainer: HTMLElement;
    timelineContainer: HTMLElement;
    currentTimelineFile: string | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: WorkLoggerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentDate = moment();
        this.existingDates = new Set();
    }

    getViewType() { return VIEW_TYPE_CALENDAR; }
    getDisplayText() { return t('viewTitle'); }
    async onOpen() {
        await this.renderCalendar();
    }
    async onClose() { }

    async renderCalendar() {
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        container.addClass('work-logger-container');

        // 渲染日历部分
        await this.renderCalendarSection(container);

        // 渲染任务列表
        this.tasksContainer = container.createDiv({ cls: 'tasks-container' });
        void this.renderIncompleteTasks();

        // 渲染本周时间线
        this.timelineContainer = container.createDiv({ cls: 'timeline-container' });
        this.timelineContainer.onclick = () => { void this.openMonthTimelineModal(); };
        void this.updateWeekTimeline();

        // 监听文件修改事件
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file.path.startsWith(this.plugin.settings.rootFolder)) {
                    this.updateWeekTimeline();
                }
            })
        );
    }

    async renderCalendarSection(container: HTMLElement) {
        const header = container.createDiv({ cls: 'calendar-header' });
        const prevBtn = header.createEl('button', { attr: { 'aria-label': t('prevMonth') } });
        setIcon(prevBtn, 'arrow-left');

        header.createEl('h3', { text: this.currentDate.format(t('dateFormat')) });

        const nextBtn = header.createEl('button', { attr: { 'aria-label': t('nextMonth') } });
        setIcon(nextBtn, 'arrow-right');

        prevBtn.onclick = () => { this.currentDate.subtract(1, 'month'); void this.renderCalendar(); };
        nextBtn.onclick = () => { this.currentDate.add(1, 'month'); void this.renderCalendar(); };

        await this.fetchAndCacheExistingFiles();

        const grid = container.createDiv({ cls: 'calendar-grid' });

        // Add empty corner cell for alignment with week-stat buttons
        grid.createDiv({ cls: 'day-header' });

        t('weekdaysShort').split(',').forEach(dayName => {
            grid.createDiv({ cls: 'day-header', text: dayName });
        });

        // 优化日历显示逻辑：只显示包含本月日期的周
        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');

        // 找到第一周的开始（周一）
        const firstWeekStart = startOfMonth.clone().startOf('isoWeek');
        // 找到最后一周的结束（周日）
        const lastWeekEnd = endOfMonth.clone().endOf('isoWeek');

        const dayIterator = firstWeekStart.clone();
        let weekCount = 0;

        while (dayIterator.isSameOrBefore(lastWeekEnd, 'day')) {
            const weekStart = dayIterator.clone();

            // 添加周统计按钮
            const weekBtn = grid.createDiv({ cls: 'week-stat-btn', attr: { 'aria-label': t('weekStatTooltip') } });
            setIcon(weekBtn, "bar-chart-3");
            weekBtn.onclick = (e) => { e.stopPropagation(); void this.generateWeekReport(weekStart); };

            // 添加这一周的7天
            for (let d = 0; d < 7; d++) {
                const dayStr = dayIterator.format('D');
                const isCurrentMonth = dayIterator.month() === this.currentDate.month();
                const targetDate = dayIterator.clone();
                const isToday = dayIterator.isSame(moment(), 'day');

                const cell = grid.createDiv({ cls: `day-cell ${isToday ? 'today' : ''}` });
                if (!isCurrentMonth) {
                    cell.addClass('other-month');
                }

                // 检查是否有数据（包括其他月份的日期）
                if (this.existingDates.has(targetDate.format('YYYY-MM-DD'))) {
                    cell.addClass('has-data');
                }

                cell.createDiv({ cls: 'day-number' }).createSpan({ text: dayStr });

                // 添加数据标记（小圆点）
                if (this.existingDates.has(targetDate.format('YYYY-MM-DD'))) {
                    cell.createDiv({ cls: 'event-mark' });
                }

                // 所有日期都可以点击，包括其他月份的日期
                cell.onclick = () => { void this.openDailyNote(targetDate); };
                dayIterator.add(1, 'day');
            }

            weekCount++;
        }
    }

    async updateWeekTimeline() {
        // 使用当前选择的日期所在周
        const startOfWeek = this.currentDate.clone().startOf('isoWeek');
        const endOfWeek = this.currentDate.clone().endOf('isoWeek');

        const weekData: Array<{ date: moment.Moment, items: Array<{ time: string, content: string, duration?: string, category?: string, icon?: string }> }> = [];

        for (let day = startOfWeek.clone(); day.isSameOrBefore(endOfWeek); day.add(1, 'day')) {
            const filePath = this.getFilePath(day);
            const items: Array<{ time: string, content: string, duration?: string }> = [];

            if (await this.app.vault.adapter.exists(filePath)) {
                try {
                    const content = await this.app.vault.adapter.read(filePath);
                    const parsedItems = this.parseTimelineFromContent(content);
                    items.push(...parsedItems);
                } catch (error) {
                    console.error('Work Logger: Failed to read file', filePath, error);
                }
            }

            if (items.length > 0) {
                weekData.push({ date: day.clone(), items });
            }
        }

        this.renderWeekTimeline(weekData);
    }

    renderWeekTimeline(weekData: Array<{ date: moment.Moment, items: Array<{ time: string, content: string, duration?: string, category?: string, icon?: string }> }>) {
        // 清空并重新创建时间线内容
        this.timelineContainer.empty();

        // 显示时间线标题
        const headerText = t('timelineTitle');
        const timelineHeaderEl = this.timelineContainer.createEl('h3', { cls: 'timeline-header' });
        setIcon(timelineHeaderEl.createSpan({ cls: 'header-icon' }), 'clock');
        timelineHeaderEl.createSpan({ text: headerText });

        const contentContainer = this.timelineContainer.createDiv({ cls: 'timeline-content' });

        if (weekData.length === 0) {
            const emptyEl = contentContainer.createDiv({ cls: 'timeline-empty' });
            emptyEl.createDiv({ text: '本周暂无工作记录' });
            return;
        }

        weekData.forEach(dayData => {
            const dayContainer = contentContainer.createDiv({ cls: 'timeline-day' });

            // 日期标题
            const dayHeader = dayContainer.createDiv({ cls: 'timeline-day-header' });
            const isToday = dayData.date.isSame(moment(), 'day');
            const dayText = isToday ? t('today') : dayData.date.format(t('dateDayFormat') === 'DD' ? 'MMM DD' : 'MM月DD日');
            const weekdayText = dayData.date.locale(window.localStorage.getItem('language') || 'en').format('dddd');
            dayHeader.textContent = `${dayText} ${weekdayText}`;

            // 时间线列表
            const dayList = dayContainer.createDiv({ cls: 'timeline-day-list' });

            dayData.items.forEach((item, index) => {
                const itemEl = dayList.createDiv({ cls: 'timeline-item' });

                // 添加分类样式
                if (item.category) {
                    itemEl.addClass(`timeline-category-${item.category}`);
                }

                // 如果是今天的最后一个项目，且时间在当前时间之前，标记为当前项
                const isCurrentItem = isToday &&
                    index === dayData.items.length - 1 &&
                    moment(item.time, 'HH:mm').isBefore(moment(), 'minute');
                if (isCurrentItem) {
                    itemEl.addClass('current');
                }

                // 添加分类图标
                if (item.icon) {
                    const iconEl = itemEl.createDiv({ cls: 'timeline-icon' });
                    setIcon(iconEl, item.icon);
                }

                itemEl.createDiv({ cls: 'timeline-time', text: item.time });
                itemEl.createDiv({ cls: 'timeline-content-text', text: item.content });

                if (item.duration) {
                    itemEl.createDiv({ cls: 'timeline-duration', text: item.duration });
                }
            });
        });
    }

    async renderIncompleteTasks() {
        this.tasksContainer.empty();

        // 渲染本月任务标题和列表
        const headerRow = this.tasksContainer.createDiv({ cls: 'tasks-header-row', attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' } });
        const headerLeft = headerRow.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
        setIcon(headerLeft.createSpan({ cls: 'header-icon' }), 'check-square');
        headerLeft.createEl('h3', { text: t('monthTasksTitle'), attr: { style: 'margin: 0; font-size: 0.95rem;' } });

        const listEl = this.tasksContainer.createDiv({ cls: 'task-list' });

        const tasks = await this.scanTasksForMonth(this.currentDate);

        if (tasks.length === 0) {
            const emptyDiv = listEl.createDiv({ cls: 'tasks-empty' });
            emptyDiv.createSpan({ text: t('noIncompleteTasks') || '本月没有未完成的任务！' });
        } else {
            const uniqueTasks = new Map<string, { task: string, path: string }>();
            tasks.forEach(task => {
                if (!uniqueTasks.has(task.task)) {
                    uniqueTasks.set(task.task, task);
                }
            });

            uniqueTasks.forEach(task => {
                const cardEl = listEl.createDiv({ cls: 'task-card' });
                cardEl.createDiv({ cls: 'checkbox' });

                const contentEl = cardEl.createDiv({ cls: 'task-content' });
                contentEl.createDiv({ cls: 'task-text', text: task.task });

                const fileName = task.path.split('/').pop()?.replace('.md', '') || '';
                let label = fileName;

                const pathParts = task.path.split('/');
                if (pathParts.length >= 2) {
                    const monthStr = pathParts[pathParts.length - 2];
                    const dayStr = pathParts[pathParts.length - 1].replace('.md', '');
                    if (monthStr.length === 6 && dayStr.length === 2) {
                        label = `${monthStr.substring(4)}-${dayStr}`;
                    }
                }

                contentEl.createDiv({ cls: 'task-meta', text: label });
                cardEl.onclick = () => { void this.app.workspace.openLinkText(task.path, ''); };
            });
        }

        // 检查上个月
        const prevMonthDate = this.currentDate.clone().subtract(1, 'month');
        const prevTasks = await this.scanTasksForMonth(prevMonthDate);

        if (prevTasks.length > 0) {
            const migrateBtn = headerRow.createEl('button', {
                cls: 'migrate-btn',
                attr: {
                    'aria-label': t('migrateTasks'),
                    style: 'padding: 4px 8px; display: flex; align-items: center; justify-content: center; border-radius: 6px; border: 1px solid var(--wl-border-color); background: transparent; cursor: pointer; color: var(--wl-text-muted);'
                }
            });
            setIcon(migrateBtn, 'import');

            migrateBtn.onclick = async () => {
                await this.migrateTasksToToday(prevTasks);
            };
        }
    }

    async migrateTasksToToday(tasks: { task: string, path: string }[]) {
        const uniqueTasks = [...new Set(tasks.map(t => t.task))];
        if (uniqueTasks.length === 0) return;

        const today = moment();
        const todayPath = this.getFilePath(today);

        const folderPath = todayPath.substring(0, todayPath.lastIndexOf('/'));
        if (!(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(todayPath);
        if (!file) {
            await this.openDailyNote(today);
            await new Promise(r => setTimeout(r, 100)); // wait for creation
            file = this.app.vault.getAbstractFileByPath(todayPath);
        }

        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            let newContent = content;
            if (!newContent.endsWith('\n')) newContent += '\n';

            newContent += `\n### ${t('migrateTasks')} (${uniqueTasks.length})\n`;
            uniqueTasks.forEach(task => {
                newContent += `- [ ] ${task}\n`;
            });

            await this.app.vault.modify(file, newContent);
            new Notice(t('migratedCount').replace('{{n}}', String(uniqueTasks.length)));
            void this.renderIncompleteTasks();
        }
    }

    async scanTasksForMonth(targetDate: moment.Moment): Promise<{ task: string, path: string }[]> {
        const tasks: { task: string, path: string }[] = [];
        const month = targetDate.month();
        const year = targetDate.year();
        const daysInMonth = targetDate.daysInMonth();

        // 使用更宽松的正则表达式来匹配各种格式的待办事项
        const taskRegex = /-\s*\[\s\]\s*([^\n\r#]*)/g;

        for (let i = 1; i <= daysInMonth; i++) {
            const date = moment({ year, month, day: i });
            const filePath = this.getFilePath(date);

            if (await this.app.vault.adapter.exists(filePath)) {
                try {
                    const content = await this.app.vault.adapter.read(filePath);
                    let match;
                    while ((match = taskRegex.exec(content)) !== null) {
                        const taskContent = match[1].trim();
                        // 过滤掉空的待办事项（只有空格或完全为空）
                        if (taskContent && taskContent.length > 0) {
                            tasks.push({ task: taskContent, path: filePath });
                        }
                    }
                } catch (e) {
                    console.error(`Work Logger: Could not read file ${filePath}`, e);
                }
            }
        }

        return tasks;
    }

    // 任务分类关键词映射
    getTaskCategory(content: string): { category: string, icon: string } {
        const lowerContent = content.toLowerCase();

        // 会议相关
        if (/会议|meeting|讨论|沟通|sync|standup|review|评审|对齐|同步|周会|日会|晨会|例会|培训|training|workshop/.test(lowerContent)) {
            return { category: 'meeting', icon: 'users' };
        }
        // 编码/开发相关
        if (/编码|coding|开发|代码|debug|调试|修复|fix|bug|feature|功能|实现|implement|重构|refactor/.test(lowerContent)) {
            return { category: 'coding', icon: 'code' };
        }
        // 架构设计相关
        if (/架构|architecture|设计|design|方案|技术方案|系统设计|概要设计|详细设计|模块设计/.test(lowerContent)) {
            return { category: 'design', icon: 'blocks' };
        }
        // 阅读/学习相关
        if (/阅读|reading|学习|learn|研究|research|文档|document|看书|教程|tutorial/.test(lowerContent)) {
            return { category: 'reading', icon: 'book-open' };
        }
        // 写作/文档相关
        if (/写作|writing|撰写|文章|blog|博客|笔记|note|记录|总结|report|报告/.test(lowerContent)) {
            return { category: 'writing', icon: 'pencil' };
        }
        // 测试相关
        if (/测试|test|qa|质量|验证|verify/.test(lowerContent)) {
            return { category: 'testing', icon: 'check-circle' };
        }
        // 休息相关
        if (/休息|break|午餐|lunch|dinner|晚餐|吃饭|coffee|咖啡/.test(lowerContent)) {
            return { category: 'break', icon: 'coffee' };
        }
        // 运动/健康相关
        if (/运动|exercise|健身|gym|跑步|run|walk|散步/.test(lowerContent)) {
            return { category: 'exercise', icon: 'heart' };
        }
        // 邮件/通讯相关
        if (/邮件|email|mail|消息|message|回复|reply|slack|钉钉|微信/.test(lowerContent)) {
            return { category: 'communication', icon: 'mail' };
        }
        // 计划/规划相关
        if (/计划|plan|规划|安排|schedule|todo|待办/.test(lowerContent)) {
            return { category: 'planning', icon: 'calendar' };
        }
        // 默认：工作
        return { category: 'work', icon: 'briefcase' };
    }

    parseTimelineFromContent(content: string): Array<{ time: string, content: string, duration?: string, category?: string, icon?: string }> {
        const lines = content.split('\n');
        const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        const items: Array<{ time: string, content: string, duration?: string, category?: string, icon?: string }> = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const match = line.match(timeRegex);

            if (match) {
                const time = match[1];
                const content = match[2].trim();

                if (content) { // 只添加有内容的时间条目
                    // 计算持续时间
                    let duration: string | undefined;
                    if (i < items.length && items.length > 0) {
                        const prevTime = moment(items[items.length - 1].time, 'HH:mm');
                        const currentTime = moment(time, 'HH:mm');
                        const diff = currentTime.diff(prevTime, 'minutes');
                        if (diff > 0) {
                            items[items.length - 1].duration = this.formatDuration(diff);
                        }
                    }

                    // 获取任务分类和图标
                    const { category, icon } = this.getTaskCategory(content);
                    items.push({ time, content, category, icon });
                }
            }
        }

        return items;
    }

    formatDuration(minutes: number): string {
        if (minutes < 60) {
            return `${minutes}分钟`;
        } else {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
        }
    }

    async fetchAndCacheExistingFiles() {
        this.existingDates.clear();
        const root = this.plugin.settings.rootFolder;

        for (let i = -1; i <= 1; i++) {
            const monthToScan = this.currentDate.clone().add(i, 'month');
            const folderPath = `${root}/${monthToScan.format('YYYYMM')}`;

            if (await this.app.vault.adapter.exists(folderPath)) {
                try {
                    const { files } = await this.app.vault.adapter.list(folderPath);
                    files.forEach(filePath => {
                        const day = filePath.split('/').pop()?.split('.')[0];
                        if (day) {
                            const dateStr = `${monthToScan.format('YYYY-MM')}-${day.padStart(2, '0')}`;
                            this.existingDates.add(dateStr);
                        }
                    });
                } catch (e) {
                    console.error(`Work Logger: Could not list files in ${folderPath}`, e);
                }
            }
        }
    }

    getFilePath(date: moment.Moment): string {
        return `${this.plugin.settings.rootFolder}/${date.format('YYYYMM')}/${date.format('DD')}.md`;
    }

    async openDailyNote(date: moment.Moment) {
        const filePath = this.getFilePath(date);
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (!(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            const templateStr = t('dailyNoteTemplate')
                .replace('{{startTime}}', this.plugin.settings.defaultStartTime)
                .replace('{{endTime}}', this.plugin.settings.defaultEndTime);
            file = await this.app.vault.create(filePath, templateStr);
        }
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
        }

        // 如果点击的日期在不同周，刷新时间线
        const clickedWeekStart = date.clone().startOf('isoWeek');
        const currentWeekStart = this.currentDate.clone().startOf('isoWeek');
        if (!clickedWeekStart.isSame(currentWeekStart, 'day')) {
            this.currentDate = date.clone();
            void this.updateWeekTimeline();
        }
    }

    async openMonthTimelineModal() {
        new MonthTimelineModal(this.app, this.plugin, this.currentDate).open();
    }

    async generateWeekReport(weekStart: moment.Moment) {
        const taskStats: Record<string, number> = {};
        let fullWeekContent = "";

        for (let i = 0; i < 7; i++) {
            const date = weekStart.clone().add(i, 'days');
            const filePath = this.getFilePath(date);
            const file = this.app.vault.getAbstractFileByPath(filePath);

            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                this.parseDailyContent(content, taskStats);
                fullWeekContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
            }
        }

        new ReportModal(this.app, this.plugin, taskStats, weekStart, this.plugin.settings, fullWeekContent).open();
    }

    parseDailyContent(content: string, stats: Record<string, number>) {
        const lines = content.split('\n');
        const regex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        interface TaskEntry { time: moment.Moment, title: string }
        const entries: TaskEntry[] = [];

        lines.forEach(line => {
            const match = line.match(regex);
            if (match) {
                entries.push({
                    time: moment(match[1], 'HH:mm'),
                    title: match[2].trim()
                });
            }
        });

        for (let i = 0; i < entries.length - 1; i++) {
            const current = entries[i];
            const next = entries[i + 1];
            const duration = moment.duration(next.time.diff(current.time)).asHours();
            if (duration > 0 && current.title) {
                if (!stats[current.title]) stats[current.title] = 0;
                stats[current.title] += duration;
            }
        }
    }
}

class ReportModal extends Modal {
    plugin: WorkLoggerPlugin;
    stats: Record<string, number>;
    weekStart: moment.Moment;
    settings: WorkLoggerSettings;
    rawContent: string;
    aiContainer: HTMLElement;
    component: Component;
    reportMode: 'week' | 'month' | 'year' | 'custom' = 'week';
    customPromptText: string;
    endDate?: moment.Moment;

    constructor(app: App, plugin: WorkLoggerPlugin, stats: Record<string, number>, weekStart: moment.Moment, settings: WorkLoggerSettings, rawContent: string, endDate?: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.stats = stats;
        this.weekStart = weekStart;
        this.settings = settings;
        this.rawContent = rawContent;
        this.endDate = endDate;
        this.component = new Component();
        this.customPromptText = this.getCurrentPrompt();
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        contentEl.addClass('work-logger-dashboard-modal');

        modalEl.style.width = '95vw';
        modalEl.style.maxWidth = '1100px';
        modalEl.style.height = '90vh';
        modalEl.style.borderRadius = '20px';
        modalEl.style.overflow = 'hidden';

        // 确保 contentEl 填满整个 modal 并允许内部滚动
        contentEl.style.height = '100%';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';

        const mainContainer = contentEl.createDiv({ cls: 'dashboard-main' });

        // 1. 极简单行头部
        const header = mainContainer.createDiv({ cls: 'dashboard-header compact-row' });

        const leftGroup = header.createDiv({ cls: 'header-left-group' });
        
        // Wrap title and range in their own flex container
        const titleGroup = leftGroup.createDiv({ cls: 'header-title-group' });
        const iconBox = titleGroup.createDiv({ cls: 'icon-box-mini' });
        setIcon(iconBox, 'bar-chart-3');
        titleGroup.createSpan({ cls: 'header-title-text', text: t('reportTitle') });

        const endD = this.endDate ? this.endDate : this.weekStart.clone().add(6, 'days');
        const weekRange = `${this.weekStart.format('MM-DD')}～${endD.format('MM-DD')}`;
        titleGroup.createSpan({ cls: 'header-range-text', text: `(${weekRange})` });
        
        // Custom Range Button in Modal Header
        const customBtn = leftGroup.createEl('button', {
            cls: 'custom-range-btn', // Use a more specific class
            attr: { 'aria-label': t('customReportTitle') }
        });
        setIcon(customBtn, 'calendar-range');
        customBtn.onclick = () => {
            this.close();
            new CustomDateRangeModal(this.app, this.plugin).open();
        };

        const scrollArea = mainContainer.createDiv({ cls: 'dashboard-scroll-area' });

        // 2. 核心数据汇总区
        const statsGrid = scrollArea.createDiv({ cls: 'stats-grid' });
        let totalH = 0;
        Object.values(this.stats).forEach(h => totalH += h);

        const totalCard = statsGrid.createDiv({ cls: 'stat-card total-hours-card' });
        totalCard.createSpan({ cls: 'card-label', text: 'TOTAL' });
        totalCard.createSpan({ cls: 'card-value', text: totalH.toFixed(1) });
        totalCard.createSpan({ cls: 'card-sub', text: t('periodTotal') });

        const distCard = statsGrid.createDiv({ cls: 'stat-card distribution-card' });
        const distHeader = distCard.createDiv({ cls: 'dist-header' });
        distHeader.createSpan({ cls: 'dist-title', text: t('distributionTitle') });

        const copyBtn = distHeader.createEl('button', { cls: 'icon-copy-btn', attr: { 'aria-label': t('copyStats') } });
        setIcon(copyBtn, 'copy');
        copyBtn.onclick = () => { void this.copyToClipboard(); };

        const progressBarGroup = distCard.createDiv({ cls: 'progress-bar-group' });
        const sortedStats = Object.entries(this.stats).sort((a, b) => b[1] - a[1]).slice(0, 5);
        const colors = ['bg-indigo', 'bg-emerald', 'bg-blue', 'bg-amber', 'bg-purple'];

        sortedStats.forEach(([name, hours], i) => {
            const item = progressBarGroup.createDiv({ cls: 'progress-item' });
            const info = item.createDiv({ cls: 'item-info' });
            info.createSpan({ cls: 'item-name', text: name });
            info.createSpan({ cls: 'item-hours', text: `${hours.toFixed(1)}h` });
            const barBg = item.createDiv({ cls: 'bar-bg' });
            const barFill = barBg.createDiv({ cls: `bar-fill ${colors[i % colors.length]}` });
            barFill.style.width = `${totalH > 0 ? (hours / totalH) * 100 : 0}%`;
        });

        // 3. AI 报告生成区 - 图标化模式切换
        const aiSection = scrollArea.createDiv({ cls: 'ai-section' });
        const aiControls = aiSection.createDiv({ cls: 'ai-controls-row' });
        const modeSwitcher = aiControls.createDiv({ cls: 'mode-switcher-icons' });
        const modes = [
            { id: 'week', icon: 'calendar-check', label: t('weekReport') },
            { id: 'month', icon: 'calendar', label: t('monthReport') },
            { id: 'year', icon: 'milestone', label: t('yearReport') },
            { id: 'custom', icon: 'user', label: t('aiCustomTitle') }
        ];

        modes.forEach(m => {
            const btn = modeSwitcher.createEl('button', {
                cls: `mode-icon-btn ${this.reportMode === m.id ? 'active' : ''}`,
                attr: { 'aria-label': m.label }
            });
            setIcon(btn, m.icon);
            btn.onclick = () => {
                this.reportMode = m.id as any;
                this.customPromptText = this.getCurrentPrompt();
                this.onOpen();
            };
        });

        const inputRow = aiSection.createDiv({ cls: 'ai-input-row' });
        const textAreaWrapper = inputRow.createDiv({ cls: 'textarea-wrapper' });
        setIcon(textAreaWrapper.createSpan({ cls: 'zap-icon' }), 'zap');
        const textArea = textAreaWrapper.createEl('textarea', {
            cls: 'ai-prompt-input',
            attr: { placeholder: t('aiCustomPrompt'), rows: '5' }
        });
        textArea.value = this.customPromptText;
        textArea.onfocus = () => { textArea.select(); };
        textArea.oninput = async () => {
            this.customPromptText = textArea.value;
            if (this.reportMode === 'week') this.plugin.settings.llmPrompt = textArea.value;
            else if (this.reportMode === 'month') this.plugin.settings.llmMonthPrompt = textArea.value;
            else if (this.reportMode === 'year') this.plugin.settings.llmYearPrompt = textArea.value;
            await this.plugin.saveSettings();
        };

        const genBtn = inputRow.createEl('button', { cls: 'start-gen-btn' });
        setIcon(genBtn.createSpan({ cls: 'btn-icon' }), 'sparkles');
        genBtn.createSpan({ text: t('startGenerate') });
        genBtn.onclick = () => { void this.handleAIGeneration(); };

        this.aiContainer = aiSection.createDiv({ cls: 'ai-result-area' });
    }

    getCurrentPrompt(): string {
        if (this.reportMode === 'week') return this.settings.llmPrompt || t('aiPrompt');
        if (this.reportMode === 'month') return this.settings.llmMonthPrompt || t('aiMonthPrompt');
        if (this.reportMode === 'year') return this.settings.llmYearPrompt || t('aiYearPrompt').replace('{{year}}', String(this.weekStart.year()));
        return ''; // Custom mode starts empty to show placeholder
    }

    async handleAIGeneration() {
        if (this.reportMode !== 'custom') {
            return this.generateSummary(this.reportMode as any);
        }

        // 自定义模式：两步交互
        this.aiContainer.empty();
        const loading = this.aiContainer.createDiv({ cls: 'ai-loading-box' });
        setIcon(loading.createDiv({ cls: 'spinner' }), 'loader-2');
        loading.createSpan({ text: " 正在分析时间范围..." });

        try {
            const rangePrompt = `分析以下指令，提取其中的时间范围。
指令："${this.customPromptText}"
当前日期：${moment().format('YYYY-MM-DD')}
输出要求：如果包含特定月份请输出 YYYYMM 格式，如果包含特定年份请输出 YYYY 格式，如果无法识别请直接输出 "NONE"。只输出结果，不要解释。`;

            const rangeResult = (await this.plugin.callLLM(this.customPromptText, rangePrompt)).trim();

            if (rangeResult === "NONE") {
                this.aiContainer.empty();
                const confirmBox = this.aiContainer.createDiv({ cls: 'ai-confirm-box' });
                confirmBox.createEl('p', { text: "未能识别到具体时间范围，是否基于本年度全量数据进行分析？" });
                const btnGroup = confirmBox.createDiv({ cls: 'confirm-btns' });

                const yesBtn = btnGroup.createEl('button', { cls: 'confirm-btn primary', text: "基于本年数据分析" });
                yesBtn.onclick = () => { void this.generateSummary('year'); };

                const noBtn = btnGroup.createEl('button', { cls: 'confirm-btn', text: "仅分析本周数据" });
                noBtn.onclick = () => { void this.generateSummary('week'); };
            } else if (rangeResult.length === 4) { // Year
                void this.generateSummary('year');
            } else if (rangeResult.length === 6) { // Month
                void this.generateSummary('month');
            } else {
                void this.generateSummary('week');
            }
        } catch (e) {
            void this.generateSummary('week');
        }
    }

    async generateSummary(type: 'week' | 'month' | 'year') {
        if (!this.settings.llmApiKey && !this.settings.llmEndpoint.includes('localhost')) {
            new Notice(t('aiApiKeyMissing'));
            return;
        }

        this.aiContainer.empty();
        const loading = this.aiContainer.createDiv({ cls: 'ai-loading-box' });
        setIcon(loading.createDiv({ cls: 'spinner' }), 'loader-2');
        loading.createSpan({ text: ` ${t('aiLoading')}` });

        try {
            let content = "";
            if (type === 'week') content = this.rawContent;
            else content = await this.loadPeriodData(type as any);

            if (!content.trim()) {
                throw new Error(type === 'month' ? t('aiMonthNoContent') : t('aiYearNoContent'));
            }

            const summary = await this.plugin.callLLM(content, this.customPromptText);

            this.aiContainer.empty();
            const resultCard = this.aiContainer.createDiv({ cls: 'ai-result-card' });
            const resultHeader = resultCard.createDiv({ cls: 'result-header' });
            resultHeader.createSpan({ cls: 'result-label', text: t('generatedDraft') });

            const copyReportBtn = resultHeader.createEl('button', { cls: 'copy-report-btn' });
            setIcon(copyReportBtn, 'copy');
            copyReportBtn.createSpan({ text: ` ${t('copyReport')}` });
            copyReportBtn.onclick = async () => {
                await navigator.clipboard.writeText(summary);
                new Notice(t('copySuccess'));
            };

            const resultContent = resultCard.createDiv({ cls: 'result-content markdown-scroll-container' });
            const mdContainer = resultContent.createDiv({ cls: 'markdown-rendered' });
            await MarkdownRenderer.render(this.app, summary, mdContainer, '', this.component);

            // Add folding support
            this.setupFolding(mdContainer);

        } catch (error) {
            this.aiContainer.empty();
            this.aiContainer.createEl('p', {
                text: `${t('aiError')} ${(error as Error).message}`,
                attr: { style: 'color: var(--text-error); padding: 20px;' }
            });
        }
    }

    setupFolding(container: HTMLElement) {
        const headers = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headers.forEach((header: HTMLElement) => {
            header.addClass('wl-collapsible-header');
            const indicator = header.createSpan({ cls: 'wl-collapse-indicator' });
            setIcon(indicator, 'chevron-down');
            header.prepend(indicator);

            header.onclick = (e) => {
                e.stopPropagation();
                const willCollapse = !header.classList.contains('is-collapsed');

                if (willCollapse) {
                    header.addClass('is-collapsed');
                    setIcon(indicator, 'chevron-right');
                } else {
                    header.removeClass('is-collapsed');
                    setIcon(indicator, 'chevron-down');
                }

                const currentLevel = parseInt(header.tagName.substring(1));
                let next = header.nextElementSibling;

                let blockedLevel: number | null = null;

                while (next) {
                    const tagName = next.tagName;
                    const isHeader = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName);
                    const nextLevel = isHeader ? parseInt(tagName.substring(1)) : 0;

                    if (isHeader && nextLevel <= currentLevel) {
                        break;
                    }

                    if (willCollapse) {
                        next.addClass('wl-hidden');
                    } else {
                        // Expanding
                        if (blockedLevel !== null) {
                            if (isHeader) {
                                if (nextLevel <= blockedLevel) {
                                    if (next.classList.contains('is-collapsed')) {
                                        blockedLevel = nextLevel;
                                    } else {
                                        blockedLevel = null;
                                    }
                                    next.removeClass('wl-hidden');
                                }
                            }
                        } else {
                            next.removeClass('wl-hidden');
                            if (isHeader && next.classList.contains('is-collapsed')) {
                                blockedLevel = nextLevel;
                            }
                        }
                    }

                    next = next.nextElementSibling;
                }
            };
        });
    }

    async loadPeriodData(type: 'month' | 'year'): Promise<string> {
        const root = this.settings.rootFolder;
        let allContent = "";

        if (type === 'month') {
            const monthStr = this.weekStart.format('YYYYMM');
            const folderPath = `${root}/${monthStr}`;
            if (await this.app.vault.adapter.exists(folderPath)) {
                const { files } = await this.app.vault.adapter.list(folderPath);
                files.sort();
                for (const filePath of files) {
                    if (filePath.endsWith('.md')) {
                        const content = await this.app.vault.adapter.read(filePath);
                        allContent += `\n=== ${filePath.split('/').pop()} ===\n${content}\n`;
                    }
                }
            }
        } else {
            const year = this.weekStart.year();
            for (let m = 1; m <= 12; m++) {
                const monthStr = `${year}${String(m).padStart(2, '0')}`;
                const folderPath = `${root}/${monthStr}`;
                if (await this.app.vault.adapter.exists(folderPath)) {
                    const { files } = await this.app.vault.adapter.list(folderPath);
                    files.sort();
                    for (const filePath of files) {
                        if (filePath.endsWith('.md')) {
                            const content = await this.app.vault.adapter.read(filePath);
                            allContent += `\n=== ${monthStr}-${filePath.split('/').pop()} ===\n${content}\n`;
                        }
                    }
                }
            }
        }
        return allContent;
    }

    async copyToClipboard() {
        let clipboardText = `${t('taskContent')}\t${t('durationHours')}\t${t('durationDays')}\n`;
        let totalH = 0;
        for (const [task, hours] of Object.entries(this.stats)) {
            totalH += hours;
            const days = (hours / this.settings.hoursPerDay).toFixed(2);
            clipboardText += `${task}\t${hours.toFixed(2)}\t${days}\n`;
        }
        clipboardText += `${t('total')}\t${totalH.toFixed(2)}\t${(totalH / this.settings.hoursPerDay).toFixed(2)}`;
        await navigator.clipboard.writeText(clipboardText);
        new Notice(t('copySuccess'));
    }

    onClose() {
        this.component.unload();
        this.contentEl.empty();
    }
}

// 月度时间线弹窗
class MonthTimelineModal extends Modal {
    plugin: WorkLoggerPlugin;
    currentDate: moment.Moment;

    constructor(app: App, plugin: WorkLoggerPlugin, currentDate: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.currentDate = currentDate.clone();
    }

    async onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.addClass('month-timeline-modal');

        // 设置弹窗宽度
        modalEl.style.width = '95vw';
        modalEl.style.maxWidth = '95vw';

        await this.renderContent();
    }

    async renderContent() {
        const { contentEl } = this;
        contentEl.empty();

        // 标题栏带切换按钮
        const headerDiv = contentEl.createDiv({ cls: 'month-timeline-header' });

        const prevBtn = headerDiv.createEl('button', { cls: 'month-nav-btn', attr: { 'aria-label': t('prevMonth') } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => {
            this.currentDate.subtract(1, 'month');
            void this.renderContent();
        };

        const titleEl = headerDiv.createEl('h2', { text: `${this.currentDate.format(t('dateFormat'))} ${t('timelineTitle')}` });

        const nextBtn = headerDiv.createEl('button', { cls: 'month-nav-btn', attr: { 'aria-label': t('nextMonth') } });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.onclick = () => {
            this.currentDate.add(1, 'month');
            void this.renderContent();
        };

        // 加载数据
        const monthData = await this.loadMonthData();

        if (monthData.length === 0) {
            contentEl.createDiv({ cls: 'month-timeline-empty', text: '本月暂无工作记录' });
            return;
        }

        // 按周分组显示
        const weeksContainer = contentEl.createDiv({ cls: 'month-timeline-weeks' });
        this.renderWeeksGrid(weeksContainer, monthData);
    }

    async loadMonthData(): Promise<Array<{ date: moment.Moment, items: Array<{ time: string, content: string, category?: string, icon?: string }> }>> {
        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');
        const monthData: Array<{ date: moment.Moment, items: Array<{ time: string, content: string, category?: string, icon?: string }> }> = [];

        for (let day = startOfMonth.clone(); day.isSameOrBefore(endOfMonth); day.add(1, 'day')) {
            const filePath = this.getFilePath(day);
            const items: Array<{ time: string, content: string, category?: string, icon?: string }> = [];

            if (await this.app.vault.adapter.exists(filePath)) {
                try {
                    const content = await this.app.vault.adapter.read(filePath);
                    const parsedItems = this.parseTimelineFromContent(content);
                    items.push(...parsedItems);
                } catch (error) {
                    console.error('Work Logger: Failed to read file', filePath, error);
                }
            }

            monthData.push({ date: day.clone(), items });
        }

        return monthData;
    }

    getFilePath(date: moment.Moment): string {
        return `${this.plugin.settings.rootFolder}/${date.format('YYYYMM')}/${date.format('DD')}.md`;
    }

    getTaskCategory(content: string): { category: string, icon: string } {
        const lowerContent = content.toLowerCase();

        if (/会议|meeting|讨论|沟通|sync|standup|review|评审|对齐|同步|周会|日会|晨会|例会|培训|training|workshop/.test(lowerContent)) {
            return { category: 'meeting', icon: 'users' };
        }
        if (/编码|coding|开发|代码|debug|调试|修复|fix|bug|feature|功能|实现|implement|重构|refactor/.test(lowerContent)) {
            return { category: 'coding', icon: 'code' };
        }
        if (/架构|architecture|设计|design|方案|技术方案|系统设计|概要设计|详细设计|模块设计/.test(lowerContent)) {
            return { category: 'design', icon: 'blocks' };
        }
        if (/阅读|reading|学习|learn|研究|research|文档|document|看书|教程|tutorial/.test(lowerContent)) {
            return { category: 'reading', icon: 'book-open' };
        }
        if (/写作|writing|撰写|文章|blog|博客|笔记|note|记录|总结|report|报告/.test(lowerContent)) {
            return { category: 'writing', icon: 'pencil' };
        }
        if (/测试|test|qa|质量|验证|verify/.test(lowerContent)) {
            return { category: 'testing', icon: 'check-circle' };
        }
        if (/休息|break|午餐|lunch|dinner|晚餐|吃饭|coffee|咖啡/.test(lowerContent)) {
            return { category: 'break', icon: 'coffee' };
        }
        if (/运动|exercise|健身|gym|跑步|run|walk|散步/.test(lowerContent)) {
            return { category: 'exercise', icon: 'heart' };
        }
        if (/邮件|email|mail|消息|message|回复|reply|slack|钉钉|微信/.test(lowerContent)) {
            return { category: 'communication', icon: 'mail' };
        }
        if (/计划|plan|规划|安排|schedule|todo|待办/.test(lowerContent)) {
            return { category: 'planning', icon: 'calendar' };
        }
        return { category: 'work', icon: 'briefcase' };
    }

    parseTimelineFromContent(content: string): Array<{ time: string, content: string, category?: string, icon?: string }> {
        const lines = content.split('\n');
        const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        const items: Array<{ time: string, content: string, category?: string, icon?: string }> = [];

        for (const line of lines) {
            const match = line.trim().match(timeRegex);
            if (match) {
                const time = match[1];
                const content = match[2].trim();
                if (content) {
                    const { category, icon } = this.getTaskCategory(content);
                    items.push({ time, content, category, icon });
                }
            }
        }

        return items;
    }

    renderWeeksGrid(container: HTMLElement, monthData: Array<{ date: moment.Moment, items: Array<{ time: string, content: string, category?: string, icon?: string }> }>) {
        // 构建完整的周数据结构
        const firstDay = monthData[0].date.clone();
        const lastDay = monthData[monthData.length - 1].date.clone();
        const firstMonday = firstDay.clone().startOf('isoWeek');
        const lastSunday = lastDay.clone().endOf('isoWeek');

        // 创建日期到数据的映射
        const dateMap = new Map<string, { date: moment.Moment, items: Array<{ time: string, content: string, category?: string, icon?: string }> }>();
        monthData.forEach(d => {
            dateMap.set(d.date.format('YYYY-MM-DD'), d);
        });

        // 按周分组 - 二维数组 weeks[周索引][星期几索引]
        type DayData = { date: moment.Moment, items: Array<{ time: string, content: string, category?: string, icon?: string }> } | null;
        const weeks: DayData[][] = [];
        const currentDay = firstMonday.clone();

        while (currentDay.isSameOrBefore(lastSunday, 'day')) {
            const week: DayData[] = [];
            for (let i = 0; i < 7; i++) {
                const dateKey = currentDay.format('YYYY-MM-DD');
                const dayData = dateMap.get(dateKey);
                const inMonth = currentDay.month() === firstDay.month();
                if (inMonth && dayData) {
                    week.push({
                        date: currentDay.clone(),
                        items: dayData.items
                    });
                } else {
                    week.push(null);
                }
                currentDay.add(1, 'day');
            }
            weeks.push(week);
        }

        console.log('Weeks count:', weeks.length);
        console.log('Weeks data:', weeks.map((w, i) => `Week ${i}: ${w.map(d => d ? d.date.format('DD') : '-').join(',')}`));

        // 用 Table 布局 - 列是周，行是星期几
        const table = container.createEl('table', { cls: 'month-timeline-table' });

        // 关键修复：使用 colgroup 强制控制列宽
        const colgroup = table.createEl('colgroup');
        colgroup.createEl('col', { attr: { style: 'width: 40px; min-width: 40px; max-width: 40px;' } }); // 侧边栏固定宽度
        for (let w = 0; w < weeks.length; w++) {
            colgroup.createEl('col'); // 其他列自动平分
        }

        // 表头 - 恢复第几周显示
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { cls: 'month-weekday-corner-cell' }); // 左上角留空

        for (let w = 0; w < weeks.length; w++) {
            const week = weeks[w];
            let start = '', end = '';
            for (let d = 0; d < 7; d++) {
                if (week[d]) {
                    if (!start) start = week[d]!.date.format('MM/DD');
                    end = week[d]!.date.format('MM/DD');
                }
            }
            const th = headerRow.createEl('th', { cls: 'month-week-header-cell' });
            th.createDiv({ text: t('weekLabel').replace('{{n}}', String(w + 1)), cls: 'week-label' });
            th.createDiv({ text: start && end ? `${start}-${end}` : '', cls: 'week-range' });
        }

        // 表体 - 7行(周一到周日)，每行有 weeks.length 列
        const tbody = table.createEl('tbody');
        const weekdayNames = t('weekdaysLong').split(',');

        for (let d = 0; d < 7; d++) {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: weekdayNames[d], cls: 'month-weekday-side-cell' });

            // 遍历每一周，取该周的第d天
            for (let w = 0; w < weeks.length; w++) {
                const td = row.createEl('td', { cls: 'month-day-cell' });
                const dayData = weeks[w][d];

                if (!dayData) {
                    td.addClass('empty-cell');
                    td.createDiv({ cls: 'empty-placeholder', text: '-' });
                    continue;
                }

                td.addClass('clickable');
                td.addEventListener('click', () => {
                    void this.openDailyNote(dayData.date);
                });

                const isToday = dayData.date.isSame(moment(), 'day');
                const dateLabel = td.createDiv({ cls: 'date-label' });
                dateLabel.textContent = dayData.date.format(t('dateDayFormat'));
                if (isToday) dateLabel.addClass('today');

                if (dayData.items.length === 0) {
                    td.addClass('no-data');
                    td.createDiv({ cls: 'no-data-placeholder', text: t('noDayData') });
                    continue;
                }

                const dayList = td.createDiv({ cls: 'timeline-day-list' });
                dayData.items.forEach(item => {
                    const isEndOfDay = item.content === '下班' || item.content === '结束工作';
                    const itemEl = dayList.createDiv({ cls: 'timeline-item' });
                    
                    if (isEndOfDay) {
                        itemEl.addClass('timeline-item-end');
                    } else if (item.category) {
                        itemEl.addClass(`timeline-category-${item.category}`);
                    }

                    if (item.icon || isEndOfDay) {
                        const iconEl = itemEl.createDiv({ cls: 'timeline-icon' });
                        let iconName = item.icon || 'circle';
                        
                        if (isEndOfDay) {
                            // Parse hours to check for overtime (>= 20:00)
                            const [hours] = item.time.split(':').map(Number);
                            iconName = hours >= 20 ? 'moon' : 'check-circle';
                        }
                        setIcon(iconEl, iconName);
                    }
                    
                    itemEl.createDiv({ cls: 'timeline-time', text: item.time });
                    if (!isEndOfDay) {
                        itemEl.createDiv({ cls: 'timeline-content-text', text: item.content });
                    }
                });
            }
        }
    }

    async openDailyNote(date: moment.Moment) {
        const filePath = this.getFilePath(date);
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (!(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            const templateStr = t('dailyNoteTemplate')
                .replace('{{startTime}}', this.plugin.settings.defaultStartTime)
                .replace('{{endTime}}', this.plugin.settings.defaultEndTime);
            file = await this.app.vault.create(filePath, templateStr);
        }
        if (file instanceof TFile) {
            await this.app.workspace.getLeaf(false).openFile(file);
            this.close();
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}

class WorkLoggerSettingTab extends PluginSettingTab {
    plugin: WorkLoggerPlugin;
    constructor(app: App, plugin: WorkLoggerPlugin) { super(app, plugin); this.plugin = plugin; }
    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setHeading().setName(t('settingsTitle'));

        new Setting(containerEl).setName(t('rootFolder')).setDesc(t('rootFolderDesc'))
            .addText(text => text.setPlaceholder('Timesheets').setValue(this.plugin.settings.rootFolder)
                .onChange(async (value) => { this.plugin.settings.rootFolder = value; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName(t('hoursPerDay')).setDesc(t('hoursPerDayDesc'))
            .addText(text => text.setPlaceholder('8').setValue(String(this.plugin.settings.hoursPerDay))
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num)) {
                        this.plugin.settings.hoursPerDay = num;
                        await this.plugin.saveSettings();
                    }
                }));

        new Setting(containerEl)
            .setName(t('defaultStartTime'))
            .setDesc(t('defaultStartTimeDesc'))
            .addText(text => text.setPlaceholder('09:00').setValue(this.plugin.settings.defaultStartTime)
                .onChange(async (value) => {
                    this.plugin.settings.defaultStartTime = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('defaultEndTime'))
            .setDesc(t('defaultEndTimeDesc'))
            .addText(text => text.setPlaceholder('18:00').setValue(this.plugin.settings.defaultEndTime)
                .onChange(async (value) => {
                    this.plugin.settings.defaultEndTime = value;
                    await this.plugin.saveSettings();
                }));



        new Setting(containerEl).setHeading().setName(t('aiConfigTitle'));
        containerEl.createEl('p', { text: t('aiConfigDesc'), cls: 'setting-item-description' });

        new Setting(containerEl).setName(t('apiEndpoint')).setDesc(t('apiEndpointDesc'))
            .addText(text => text.setPlaceholder('https://...')
                .setValue(this.plugin.settings.llmEndpoint)
                .onChange(async (value) => { this.plugin.settings.llmEndpoint = value; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName(t('apiKey')).setDesc(t('apiKeyDesc'))
            .addText(text => text.setPlaceholder('sk-...')
                .setValue(this.plugin.settings.llmApiKey)
                .onChange(async (value) => { this.plugin.settings.llmApiKey = value; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName(t('modelName')).setDesc(t('modelNameDesc'))
            .addText(text => text.setPlaceholder('gemini-2.5-flash')
                .setValue(this.plugin.settings.llmModel)
                .onChange(async (value) => { this.plugin.settings.llmModel = value; await this.plugin.saveSettings(); }));

        new Setting(containerEl).setName(t('prompt')).setDesc(t('promptDesc'))
            .addTextArea(text => {
                text.setPlaceholder('Weekly Report Prompt...')
                    .setValue(this.plugin.settings.llmPrompt)
                    .onChange(async (value: string) => {
                        this.plugin.settings.llmPrompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 5;
                text.inputEl.style.width = '100%';
            });

        new Setting(containerEl).setName(t('monthReport')).setDesc(t('promptDesc'))
            .addTextArea(text => {
                text.setPlaceholder('Monthly Report Prompt...')
                    .setValue(this.plugin.settings.llmMonthPrompt)
                    .onChange(async (value: string) => {
                        this.plugin.settings.llmMonthPrompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 5;
                text.inputEl.style.width = '100%';
            });

        new Setting(containerEl).setName(t('yearSummaryTooltip')).setDesc(t('promptDesc'))
            .addTextArea(text => {
                text.setPlaceholder('Year End Summary Prompt...')
                    .setValue(this.plugin.settings.llmYearPrompt)
                    .onChange(async (value: string) => {
                        this.plugin.settings.llmYearPrompt = value;
                        await this.plugin.saveSettings();
                    });
                text.inputEl.rows = 5;
                text.inputEl.style.width = '100%';
            });
    }
}

class CustomDateRangeModal extends Modal {
    plugin: WorkLoggerPlugin;
    startDate: string;
    endDate: string;

    constructor(app: App, plugin: WorkLoggerPlugin) {
        super(app);
        this.plugin = plugin;
        this.startDate = moment().startOf('isoWeek').format('YYYY-MM-DD');
        this.endDate = moment().endOf('isoWeek').format('YYYY-MM-DD');
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: t('customReportTitle') });

        // 快捷按钮区
        const shortcutsDiv = contentEl.createDiv({ cls: 'date-shortcuts', attr: { style: 'display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;' } });

        const createShortcut = (label: string, start: moment.Moment, end: moment.Moment) => {
            const btn = shortcutsDiv.createEl('button', { text: label });
            btn.onclick = () => {
                this.startDate = start.format('YYYY-MM-DD');
                this.endDate = end.format('YYYY-MM-DD');
                // 刷新界面显示
                this.onOpen();
            };
        };

        createShortcut(t('thisWeek'), moment().startOf('isoWeek'), moment().endOf('isoWeek'));
        createShortcut(t('lastWeek'), moment().subtract(1, 'week').startOf('isoWeek'), moment().subtract(1, 'week').endOf('isoWeek'));
        createShortcut(t('thisMonth'), moment().startOf('month'), moment().endOf('month'));
        createShortcut(t('last7Days'), moment().subtract(6, 'days'), moment());

        // 日期选择区
        new Setting(contentEl)
            .setName(t('startDate'))
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.startDate)
                    .onChange(value => this.startDate = value);
            });

        new Setting(contentEl)
            .setName(t('endDate'))
            .addText(text => {
                text.inputEl.type = 'date';
                text.setValue(this.endDate)
                    .onChange(value => this.endDate = value);
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText(t('generate'))
                .setCta()
                .onClick(() => {
                    const start = moment(this.startDate, 'YYYY-MM-DD', true);
                    const end = moment(this.endDate, 'YYYY-MM-DD', true);

                    if (start.isValid() && end.isValid()) {
                        this.close();
                        void this.plugin.generateCustomReport(start, end);
                    } else {
                        new Notice(t('invalidDate'));
                    }
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}