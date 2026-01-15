import { ItemView, WorkspaceLeaf, setIcon, moment, TFile, MarkdownRenderer, Notice, Modal, App, MarkdownView, debounce } from 'obsidian';
import { t } from '../lang';
import { VIEW_TYPE_CALENDAR, DayData, TimelineItem, TaskInfo } from './types';
import type WorkLoggerPlugin from '../main';
import { getTaskCategory, formatDuration, parseDailyContent, parseTimelineFromContent, scanTasksForMonth, fetchAndCacheExistingFiles, getAdjustedWeekRange } from './utils';
import { MonthTimelineModal } from './month-timeline-modal';
import { preloadHolidays, getDayDisplayType, formatHolidayName } from './holidays';
import { getSchedulesForDate, generateScheduleContent, RecurringScheduleModal } from './recurring';
import { ReportModal } from './report-modal';
import { invokeMCP } from './mcp';

/**
 * 侧边栏日历视图类
 */
export class CalendarView extends ItemView {
    plugin: WorkLoggerPlugin;
    currentDate: moment.Moment;
    timelineContainer: HTMLElement;
    tasksContainer: HTMLElement;
    existingDates: Set<string>;
    private timerInterval: any = null;
    private lastTaskTitle: string = "";

    constructor(leaf: WorkspaceLeaf, plugin: WorkLoggerPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.currentDate = moment();
        this.existingDates = new Set();
    }

    getViewType(): string { return VIEW_TYPE_CALENDAR; }
    getDisplayText(): string { return t('viewTitle'); }
    getIcon(): string { return "calendar-with-checkmark"; }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('work-logger-sidebar');

        const container = contentEl.createDiv({ cls: 'work-logger-container' });

        // 1. 日历部分
        const calWrapper = container.createDiv({ cls: 'calendar-container' });
        await this.renderCalendarSection(calWrapper);

        // 2. 实时计时器
        await this.renderActiveTracker(container);

        // 3. AI 建议
        this.renderAiSuggestion(container);

        // 4. 待办事项
        this.tasksContainer = container.createDiv({ cls: 'tasks-container' });
        void this.renderIncompleteTasks();

        // 5. 时间线
        this.timelineContainer = container.createDiv({ cls: 'timeline-container' });
        this.timelineContainer.onclick = () => { void this.openMonthTimelineModal(); };
        void this.updateWeekTimeline();

        const debouncedRefresh = debounce(() => {
            this.updateWeekTimeline();
            const container = this.contentEl.querySelector('.work-logger-container') as HTMLElement;
            if (container) void this.renderActiveTracker(container);
        }, 1000, true);

        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file.path.startsWith(this.plugin.settings.rootFolder)) debouncedRefresh();
        }));
    }

    async renderActiveTracker(container: HTMLElement) {
        let trackerWrapper = container.querySelector('.wl-active-tracker') as HTMLElement;
        if (!trackerWrapper) {
            trackerWrapper = container.createDiv({ cls: 'wl-active-tracker' });
            container.prepend(trackerWrapper);
        }

        const activeTask = await this.plugin.getActiveTask();
        if (this.timerInterval) window.clearInterval(this.timerInterval);

        if (!activeTask) {
            this.lastTaskTitle = "";
            trackerWrapper.addClass('is-hidden');
            trackerWrapper.empty();
            return;
        }
        
        trackerWrapper.removeClass('is-hidden');
        if (activeTask.title === this.lastTaskTitle) {
            const timerEl = trackerWrapper.querySelector('.wl-tracker-timer-mini');
            if (timerEl) { this.startTimer(timerEl, activeTask.startTime); return; }
        }

        this.lastTaskTitle = activeTask.title;
        trackerWrapper.empty();

        const info = trackerWrapper.createDiv({ cls: 'wl-tracker-info' });
        info.createDiv({ text: activeTask.title, cls: 'wl-tracker-title-mini' });
        const timerEl = info.createDiv({ cls: 'wl-tracker-timer-mini' });
        this.startTimer(timerEl, activeTask.startTime);

        const stopBtn = trackerWrapper.createEl('button', { cls: 'wl-tracker-stop-mini' });
        setIcon(stopBtn, 'list-plus');
        stopBtn.onclick = async (e) => { e.stopPropagation(); await this.handleStopAndNew(); };
    }

    private startTimer(timerEl: Element, startTime: moment.Moment) {
        if (this.timerInterval) window.clearInterval(this.timerInterval);
        const updateClock = () => {
            const now = moment();
            const diff = moment.duration(now.diff(startTime));
            const h = Math.floor(diff.asHours());
            const m = diff.minutes();
            timerEl.textContent = `${h > 0 ? h + 'h ' : ''}${m}m`;
        };
        updateClock();
        this.timerInterval = window.setInterval(updateClock, 30000);
    }

    async handleStopAndNew() {
        const today = moment();
        const path = this.getFilePath(today);
        let file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) { await this.openDailyNote(today); file = this.app.vault.getAbstractFileByPath(path); }
        if (file instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(false);
            await leaf.openFile(file);
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const timeStr = moment().format('HH:mm');
            const newEntry = `- ${timeStr} `;
            let insertIndex = lines.length;
            const timeRegex = /^-\s*(\d{1,2}:\d{2})/;
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(timeRegex);
                if (match) {
                    const entryTime = moment(match[1], 'HH:mm');
                    entryTime.year(today.year()).month(today.month()).date(today.date());
                    if (entryTime.isAfter(today)) { insertIndex = i; break; }
                }
            }
            lines.splice(insertIndex, 0, newEntry);
            await this.app.vault.modify(file, lines.join('\n'));
            setTimeout(() => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (view) { const editor = view.editor; editor.focus(); editor.setCursor(insertIndex, newEntry.length); }
            }, 50);
        }
    }

    renderAiSuggestion(container: HTMLElement) {
        const suggestion = this.plugin.settings.lastAiSuggestion;
        if (!suggestion) return;
        const card = container.createDiv({ cls: 'wl-tip-card' });
        const header = card.createDiv({ cls: 'wl-tip-header' });
        setIcon(header.createSpan({ cls: 'wl-tip-icon' }), 'sparkles');
        header.createSpan({ text: '今日开工锦囊', cls: 'wl-tip-title' });
        card.createDiv({ text: suggestion.content, cls: 'wl-tip-content' });
        card.setAttribute('aria-label', '点击收起锦囊');
        card.onclick = async () => { this.plugin.settings.lastAiSuggestion = undefined; await this.plugin.saveSettings(); this.onOpen(); };
    }

    /**
     * 打开 MCP 交互弹窗
     */
    async openMcpModal() {
        const modal = new Modal(this.app);
        modal.contentEl.addClass('wl-mcp-modal');
        
        // 头部：标题与复制按钮 (使用可配置标题)
        const header = modal.contentEl.createDiv({ cls: 'mcp-modal-header' });
        header.createEl('h3', { text: this.plugin.settings.mcpModalTitle || 'MCP 智能助理' });
        
        const copyBtn = header.createDiv({ cls: 'mcp-copy-btn', attr: { 'aria-label': '复制内容' } });
        setIcon(copyBtn, 'copy');
        
        // 指令选择区 (从配置读取)
        const promptContainer = modal.contentEl.createDiv({ cls: 'mcp-prompt-container' });
        const prompts = this.plugin.settings.mcpPrompts && this.plugin.settings.mcpPrompts.length > 0 
            ? this.plugin.settings.mcpPrompts 
            : [{ label: '📝 总结待办', prompt: '帮我总结最近的待办事项' }];

        // 自由提问区 (Chat Input)
        const inputContainer = modal.contentEl.createDiv({ cls: 'mcp-input-container' });
        const input = inputContainer.createEl('input', { type: 'text', placeholder: '输入问题，按回车发送...', cls: 'mcp-custom-input' });
        const sendBtn = inputContainer.createDiv({ cls: 'mcp-send-btn', attr: { 'aria-label': '发送' } });
        setIcon(sendBtn, 'send');

        const resultArea = modal.contentEl.createDiv({ cls: 'mcp-result-area markdown-rendered' });
        let currentContent = "";

        const runPrompt = async (promptText: string, useCache: boolean = false) => {
            if (useCache && this.plugin.settings.mcpCache?.content && this.plugin.settings.mcpCache?.lastFetched === moment().format('YYYY-MM-DD')) {
                currentContent = this.plugin.settings.mcpCache.content;
                resultArea.empty();
                void MarkdownRenderer.render(this.plugin.app, currentContent, resultArea, '', this);
                return;
            }

            resultArea.empty();
            const loading = resultArea.createDiv({ cls: 'mcp-loading' });
            setIcon(loading.createSpan({ cls: 'is-spinning' }), 'loader-2');
            loading.createSpan({ text: ' 正在处理请求...' });

            try {
                const result = await invokeMCP(this.plugin, promptText);
                currentContent = result;
                resultArea.empty();
                void MarkdownRenderer.render(this.plugin.app, result, resultArea, '', this);
                
                // 缓存结果
                this.plugin.settings.mcpCache = {
                    content: result,
                    lastFetched: moment().format('YYYY-MM-DD')
                };
                await this.plugin.saveSettings();
            } catch (e) {
                resultArea.empty();
                resultArea.createEl('p', { text: `错误: ${e.message}`, attr: { style: 'color: var(--text-error)' } });
            }
        };

        prompts.forEach((p, index) => {
            const btn = promptContainer.createEl('button', { text: p.label, cls: 'mcp-prompt-btn' });
            btn.onclick = () => runPrompt(p.prompt);
            // 默认自动点击第一个按钮
            if (index === 0) btn.addClass('is-active');
        });

        // Input area moved to top

        const handleSend = () => {
            const text = input.value.trim();
            if (!text) return;
            runPrompt(text);
            input.value = '';
        };

        input.onkeydown = (e) => { if (e.key === 'Enter') handleSend(); };
        sendBtn.onclick = handleSend;

        copyBtn.onclick = async () => {
            if (!currentContent) return;
            await navigator.clipboard.writeText(currentContent);
            new Notice('已复制到剪贴板');
        };

        modal.open();
        
        // 默认运行第一个 prompt，并尝试使用缓存
        void runPrompt(prompts[0].prompt, true);
    }

    async renderCalendarSection(container: HTMLElement) {
        const currentYear = this.currentDate.year();
        await preloadHolidays([currentYear - 1, currentYear, currentYear + 1]);
        const header = container.createDiv({ cls: 'calendar-header-modern' });
        
        const calBadge = header.createDiv({ cls: 'calendar-badge' });
        setIcon(calBadge, 'calendar');

        header.createEl('h3', { cls: 'calendar-title', text: this.currentDate.format(t('dateFormat')) });
        const navGroup = header.createDiv({ cls: 'calendar-nav-group' });

        // MCP 按钮
        const mcpBtn = navGroup.createEl('button', { cls: 'nav-btn', attr: { 'aria-label': '打开智能助理' } });
        setIcon(mcpBtn, 'cloud');
        mcpBtn.onclick = () => {
            if (!this.plugin.settings.mcpUrl) {
                new Notice('请先在设置中配置 MCP 服务地址。');
                return;
            }
            void this.openMcpModal(); 
        };

        const aiBtn = navGroup.createEl('button', { cls: 'nav-btn ai-coach-btn', attr: { 'aria-label': t('aiCoachTitle') } });
        setIcon(aiBtn, 'sparkles');
        aiBtn.onclick = async () => { aiBtn.addClass('is-spinning'); await this.plugin.checkAndRunProactiveAi(true); aiBtn.removeClass('is-spinning'); this.onOpen(); };

        const recurringBtn = navGroup.createEl('button', { cls: 'nav-btn', attr: { 'aria-label': t('recurringSchedules') } });
        setIcon(recurringBtn, 'alarm-clock');
        recurringBtn.onclick = () => { this.openRecurringModal(); };

        const prevBtn = navGroup.createEl('button', { cls: 'nav-btn', attr: { 'aria-label': t('prevMonth') } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => { this.currentDate.subtract(1, 'month'); void this.onOpen(); };

        const todayBtn = navGroup.createEl('button', { cls: 'nav-btn', attr: { 'aria-label': t('goToToday') } });
        setIcon(todayBtn, 'rotate-ccw');
        todayBtn.onclick = () => { this.currentDate = moment(); void this.onOpen(); };

        const nextBtn = navGroup.createEl('button', { cls: 'nav-btn', attr: { 'aria-label': t('nextMonth') } });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.onclick = () => { this.currentDate.add(1, 'month'); void this.onOpen(); };

        this.existingDates = await fetchAndCacheExistingFiles(this.app, this.plugin.settings.rootFolder, this.currentDate);
        const grid = container.createDiv({ cls: 'calendar-grid' });
        grid.createDiv({ cls: 'day-header' });
        const weekdayLabels = t('weekdaysShort').split(',');
        weekdayLabels.forEach((dayName, index) => {
            const headerCell = grid.createDiv({ cls: 'day-header', text: dayName });
            if (index === 5 || index === 6) headerCell.addClass('weekend-header');
        });

        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');
        const firstWeekStart = startOfMonth.clone().startOf('isoWeek');
        const lastWeekEnd = endOfMonth.clone().endOf('isoWeek');
        const dayIterator = firstWeekStart.clone();

        while (dayIterator.isSameOrBefore(lastWeekEnd, 'day')) {
            const weekStart = dayIterator.clone();
            let hasWeekData = false;
            for (let i = 0; i < 7; i++) {
                if (this.existingDates.has(weekStart.clone().add(i, 'days').format('YYYY-MM-DD'))) { hasWeekData = true; break; }
            }
            const weekBtn = grid.createDiv({ cls: 'week-stat-btn' });
            if (hasWeekData) {
                setIcon(weekBtn, "bar-chart-3");
                weekBtn.onclick = (e) => { e.stopPropagation(); void this.generateWeekReport(weekStart); };
            }
            for (let d = 0; d < 7; d++) {
                const isCurrentMonth = dayIterator.month() === this.currentDate.month();
                const targetDate = dayIterator.clone();
                const cell = grid.createDiv({ cls: `day-cell ${dayIterator.isSame(moment(), 'day') ? 'today' : ''}` });
                if (!isCurrentMonth) cell.addClass('other-month');
                if (this.existingDates.has(targetDate.format('YYYY-MM-DD'))) { cell.addClass('has-data'); cell.createDiv({ cls: 'event-mark' }); }
                this.renderDayCellWithHoliday(cell, targetDate, dayIterator.format('D'), d);
                cell.onclick = () => { void this.openDailyNote(targetDate); };
                dayIterator.add(1, 'day');
            }
        }
    }

    async renderDayCellWithHoliday(cell: HTMLElement, date: moment.Moment, dayStr: string, weekdayIndex: number) {
        const displayInfo = await getDayDisplayType(date);
        const dayNumberEl = cell.createDiv({ cls: 'day-number' });
        dayNumberEl.createSpan({ text: dayStr });
        if (displayInfo.type === 'holiday') {
            cell.addClass('holiday-day');
            const badge = cell.createDiv({ cls: 'holiday-badge rest-badge' });
            badge.textContent = displayInfo.holidayInfo?.name ? formatHolidayName(displayInfo.holidayInfo.name, 2) : '休';
        } else if (displayInfo.type === 'workday') {
            cell.addClass('workday-day');
            const badge = cell.createDiv({ cls: 'holiday-badge work-badge' });
            badge.textContent = '班';
        }
    }

    openRecurringModal() {
        new RecurringScheduleModal(this.app, this.plugin, this.plugin.settings.recurringSchedules || [], async (s) => { this.plugin.settings.recurringSchedules = s; await this.plugin.saveSettings(); }).open();
    }

    async updateWeekTimeline() {
        const { start, end } = await getAdjustedWeekRange(this.currentDate);
        const weekData: DayData[] = [];
        for (let d = start.clone(); d.isSameOrBefore(end); d.add(1, 'day')) {
            const filePath = this.getFilePath(d);
            if (await this.app.vault.adapter.exists(filePath)) {
                const content = await this.app.vault.read(this.app.vault.getAbstractFileByPath(filePath) as TFile);
                const items = parseTimelineFromContent(content, this.plugin.settings.categories);
                if (items.length > 0) weekData.push({ date: d.clone(), items });
            }
        }
        this.renderWeekTimeline(weekData);
    }

    renderWeekTimeline(weekData: DayData[]) {
        this.timelineContainer.empty();
        const header = this.timelineContainer.createEl('h3', { cls: 'timeline-day-header', text: t('timelineTitle') });
        const content = this.timelineContainer.createDiv({ cls: 'timeline-content' });
        if (weekData.length === 0) { content.createDiv({ cls: 'timeline-empty', text: '本周暂无记录' }); return; }
        weekData.forEach(day => {
            const dayContainer = content.createDiv({ cls: 'timeline-day' });
            const isToday = day.date.isSame(moment(), 'day');
            dayContainer.createDiv({ cls: 'timeline-date-label', text: `${isToday ? t('today') : day.date.format('MM月DD日')} ${day.date.locale('zh-cn').format('dddd')}`, attr: { style: 'font-size:10px; font-weight:700; color:var(--text-accent); margin-bottom:8px;' } });
            const list = dayContainer.createDiv({ cls: 'timeline-day-list' });
            day.items.forEach((item, i) => {
                const itemEl = list.createDiv({ cls: 'timeline-item' });
                if (item.icon) setIcon(itemEl.createDiv({ cls: 'timeline-icon' }), item.icon);
                const textGroup = itemEl.createDiv({ cls: 'timeline-text-group' });
                textGroup.createDiv({ cls: 'timeline-time', text: item.time });
                textGroup.createDiv({ cls: 'timeline-content-text', text: item.content });
                if (item.description) textGroup.createDiv({ cls: 'timeline-description-text', text: item.description, attr: { style: 'font-size:11px; color:var(--text-muted);' } });
            });
        });
    }

    async renderIncompleteTasks() {
        this.tasksContainer.empty();
        const header = this.tasksContainer.createDiv({ cls: 'tasks-header-row' });
        const left = header.createDiv({ attr: { style: 'display:flex;align-items:center;gap:8px;' } });
        setIcon(left.createSpan({ cls: 'header-icon' }), 'check-square');
        left.createEl('h3', { text: t('monthTasksTitle'), attr: { style: 'margin:0;font-size:0.95rem;' } });
        const list = this.tasksContainer.createDiv({ cls: 'task-list', attr: { style: 'margin-top:12px; display:flex; flex-direction:column; gap:8px;' } });
        const tasks = await scanTasksForMonth(this.app, this.plugin.settings.rootFolder, this.currentDate);
        if (tasks.length === 0) list.createDiv({ cls: 'tasks-empty', text: t('noIncompleteTasks'), attr: { style: 'font-size:12px; color:var(--text-muted);' } });
        else {
            const unique = new Map(); tasks.forEach(t => { if (!unique.has(t.task)) unique.set(t.task, t); });
            unique.forEach(task => {
                const card = list.createDiv({ cls: 'task-card', attr: { style: 'padding:10px; background:var(--background-secondary-alt); border-radius:10px; display:flex; align-items:center; gap:10px; cursor:pointer;' } });
                card.createDiv({ cls: 'checkbox', attr: { style: 'width:16px; height:16px; border:2px solid var(--background-modifier-border); border-radius:4px;' } });
                card.createDiv({ text: task.task, attr: { style: 'font-size:13px; font-weight:500;' } });
                card.onclick = () => { void this.app.workspace.openLinkText(task.path, ''); };
            });
        }
        const prevMonth = this.currentDate.clone().subtract(1, 'month');
        const prevTasks = await scanTasksForMonth(this.app, this.plugin.settings.rootFolder, prevMonth);
        if (prevTasks.length > 0) {
            const migrate = header.createEl('button', { cls: 'migrate-btn', attr: { 'aria-label': t('migrateTasks') } });
            setIcon(migrate, 'import');
            migrate.onclick = async () => { await this.migrateTasksToToday(prevTasks); };
        }
    }

    async migrateTasksToToday(tasks: TaskInfo[]) {
        const unique = [...new Set(tasks.map(t => t.task))]; if (unique.length === 0) return;
        const file = this.app.vault.getAbstractFileByPath(this.getFilePath(moment()));
        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            let newContent = content.trimEnd() + `\n\n### ${t('migrateTasks')} (${unique.length})\n`;
            unique.forEach(t => { newContent += `- [ ] ${t}\n`; });
            await this.app.vault.modify(file, newContent);
            new Notice(t('migratedCount').replace('{{n}}', String(unique.length)));
            void this.renderIncompleteTasks();
        }
    }

    getFilePath(date: moment.Moment): string { return `${this.plugin.settings.rootFolder}/${date.format('YYYYMM')}/${date.format('DD')}.md`; }
    async openDailyNote(date: moment.Moment) {
        const filePath = this.getFilePath(date);
        if (!(await this.app.vault.adapter.exists(filePath.substring(0, filePath.lastIndexOf('/'))))) await this.app.vault.createFolder(filePath.substring(0, filePath.lastIndexOf('/')));
        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file) {
            let templateStr = t('dailyNoteTemplate');

            // 获取该日期适用的周期性日程
            const schedules = getSchedulesForDate(this.plugin.settings.recurringSchedules || [], date);
            if (schedules.length > 0) {
                const scheduleContent = generateScheduleContent(schedules);
                // 查找 "### 工作记录" 标题的位置
                const workRecordHeading = '### 工作记录';
                const headingIndex = templateStr.indexOf(workRecordHeading);

                if (headingIndex !== -1) {
                    const insertPos = templateStr.indexOf('\n', headingIndex) + 1; // 标题后的新行
                    if (insertPos !== -1) {
                        templateStr = templateStr.slice(0, insertPos) + scheduleContent + '\n' + templateStr.slice(insertPos);
                    } else {
                        // 如果工作记录标题是最后一行，直接追加
                        templateStr += '\n' + scheduleContent;
                    }
                } else {
                    // 如果没有“工作记录”标题，退而求其次在 {{startTime}} 后插入
                    const startTimeMarker = '{{startTime}}';
                    const markerPos = templateStr.indexOf(startTimeMarker);
                    let insertPos = -1;
                    if (markerPos !== -1) {
                        const lineEnd = templateStr.indexOf('\n', markerPos);
                        insertPos = lineEnd !== -1 ? lineEnd + 1 : templateStr.length;
                    }
                    if (insertPos !== -1) {
                        templateStr = templateStr.slice(0, insertPos) + scheduleContent + '\n' + templateStr.slice(insertPos);
                    } else {
                        // 最后手段：直接追加到文件末尾
                        templateStr += '\n' + scheduleContent;
                    }
                }
            }

            // 之后再执行占位符替换
            templateStr = templateStr
                .replace('{{startTime}}', this.plugin.settings.defaultStartTime)
                .replace('{{endTime}}', this.plugin.settings.defaultEndTime);

            file = await this.app.vault.create(filePath, templateStr);
        }

        if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
        if (!date.isSame(this.currentDate, 'week')) { this.currentDate = date.clone(); void this.onOpen(); }
    }

    async openMonthTimelineModal() { new MonthTimelineModal(this.app, this.plugin, this.currentDate).open(); }
    async generateWeekReport(weekStart: moment.Moment) {
        const { start, end } = await getAdjustedWeekRange(weekStart);
        const taskStats: Record<string, number> = {}; 
        let fullWeekContent = "";
        for (let d = start.clone(); d.isSameOrBefore(end); d.add(1, 'day')) {
            const file = this.app.vault.getAbstractFileByPath(this.getFilePath(d));
            if (file instanceof TFile) { 
                const c = await this.app.vault.read(file); 
                parseDailyContent(c, taskStats); 
                fullWeekContent += `\n=== ${d.format('YYYY-MM-DD')} ===\n${c}\n`; 
            }
        }
        new ReportModal(this.app, this.plugin, start, this.plugin.settings, fullWeekContent, end).open();
    }
    async onClose() { if (this.timerInterval) window.clearInterval(this.timerInterval); }
}
