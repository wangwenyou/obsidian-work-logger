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
			const weekBtn = grid.createDiv({ cls: 'week-stat-btn', attr: {'aria-label': t('weekStatTooltip')} });
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
        
        const weekData: Array<{date: moment.Moment, items: Array<{time: string, content: string, duration?: string, category?: string, icon?: string}>}> = [];
        
        for (let day = startOfWeek.clone(); day.isSameOrBefore(endOfWeek); day.add(1, 'day')) {
            const filePath = this.getFilePath(day);
            const items: Array<{time: string, content: string, duration?: string}> = [];
            
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

    renderWeekTimeline(weekData: Array<{date: moment.Moment, items: Array<{time: string, content: string, duration?: string, category?: string, icon?: string}>}>) {
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
            const dayText = isToday ? '今天' : dayData.date.format('MM月DD日');
            const weekdayText = dayData.date.format('dddd');
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
        const tasks = await this.scanMonthForIncompleteTasks();

        if (tasks.length === 0) {
            const emptyDiv = this.tasksContainer.createDiv({ cls: 'tasks-empty' });
            emptyDiv.createSpan({ text: t('noIncompleteTasks') || '本月没有未完成的任务！' });
            return;
        }

        const tasksHeaderEl = this.tasksContainer.createEl('h3', { cls: 'tasks-header' });
        setIcon(tasksHeaderEl.createSpan({ cls: 'header-icon' }), 'check-square');
        tasksHeaderEl.createSpan({ text: t('monthTasksTitle') });
        const listEl = this.tasksContainer.createDiv({ cls: 'task-list' });

        const uniqueTasks = new Map<string, { task: string, path: string }>();
        tasks.forEach(task => {
            if (!uniqueTasks.has(task.task)) {
                uniqueTasks.set(task.task, task);
            }
        });

        uniqueTasks.forEach(task => {
            const cardEl = listEl.createDiv({ cls: 'task-card' });
            
            // 复选框
            cardEl.createDiv({ cls: 'checkbox' });
            
            // 内容区域
            const contentEl = cardEl.createDiv({ cls: 'task-content' });
            contentEl.createDiv({ cls: 'task-text', text: task.task });
            
            // 添加文件名作为辅助信息
            const fileName = task.path.split('/').pop()?.replace('.md', '') || '';
            let label = fileName;
            
            // 尝试从路径解析日期
            const pathParts = task.path.split('/');
            if (pathParts.length >= 2) {
                const monthStr = pathParts[pathParts.length - 2];
                const dayStr = pathParts[pathParts.length - 1].replace('.md', '');
                if (monthStr.length === 6 && dayStr.length === 2) {
                    label = `${monthStr.substring(4)}-${dayStr}`;
                }
            }

            contentEl.createDiv({ cls: 'task-meta', text: label });

            cardEl.onclick = () => {
                void this.app.workspace.openLinkText(task.path, '');
            };
        });
    }

    async scanMonthForIncompleteTasks(): Promise<{ task: string, path: string }[]> {
        const tasks: { task: string, path: string }[] = [];
        const month = this.currentDate.month();
        const year = this.currentDate.year();
        const daysInMonth = this.currentDate.daysInMonth();
        
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

    parseTimelineFromContent(content: string): Array<{time: string, content: string, duration?: string, category?: string, icon?: string}> {
        const lines = content.split('\n');
        const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        const items: Array<{time: string, content: string, duration?: string, category?: string, icon?: string}> = [];
        
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

		new ReportModal(this.app, taskStats, weekStart, this.plugin.settings, fullWeekContent).open();
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
            if (duration > 0) {
                if (!stats[current.title]) stats[current.title] = 0;
                stats[current.title] += duration;
            }
		}
	}
}

class ReportModal extends Modal {
	stats: Record<string, number>;
    weekStart: moment.Moment;
    settings: WorkLoggerSettings;
    rawContent: string;
    aiContainer: HTMLElement;
    component: Component;

	constructor(app: App, stats: Record<string, number>, weekStart: moment.Moment, settings: WorkLoggerSettings, rawContent: string) {
		super(app);
		this.stats = stats;
        this.weekStart = weekStart;
        this.settings = settings;
        this.rawContent = rawContent;
        this.component = new Component();
	}

	onOpen() {
		const { contentEl } = this;
        contentEl.addClass('work-logger-modal');
        
        const weekRange = `${this.weekStart.format('MM-DD')} - ${this.weekStart.clone().add(6, 'days').format('MM-DD')}`;
        
        const headerDiv = contentEl.createDiv({ cls: 'modal-header-flex' });
        headerDiv.createEl('h2', { text: `${t('reportTitle')} (${weekRange})`, attr: { style: 'margin:0' } });

        const actionDiv = headerDiv.createDiv({ cls: 'modal-actions' });
        
        new ButtonComponent(actionDiv)
            .setIcon('sparkles')
            .setTooltip(t('aiTitle'))
            .onClick(() => { void this.generateAISummary(); });
        
        new ButtonComponent(actionDiv)
            .setIcon('copy')
            .setTooltip(t('copyTooltip'))
            .onClick(() => { void this.copyToClipboard(); });

		const table = contentEl.createEl('table', { cls: 'stat-table' });
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { text: t('taskContent') });
        headerRow.createEl('th', { text: t('durationHours') });
        headerRow.createEl('th', { text: t('durationDays') });

        const tbody = table.createEl('tbody');
        let totalH = 0;

        if (Object.keys(this.stats).length > 0) {
            for (const [task, hours] of Object.entries(this.stats)) {
                totalH += hours;
                const row = tbody.createEl('tr');
                row.createEl('td', { text: task });
                row.createEl('td', { text: hours.toFixed(2) });
                row.createEl('td', { text: (hours / this.settings.hoursPerDay).toFixed(2) });
            }
            const totalRow = tbody.createEl('tr', { cls: 'stat-total-row' });
            totalRow.createEl('td').createEl('strong', { text: t('total') });
            totalRow.createEl('td').createEl('strong', { text: totalH.toFixed(2) });
            totalRow.createEl('td').createEl('strong', { text: (totalH / this.settings.hoursPerDay).toFixed(2) });
        } else {
             tbody.createEl('tr').createEl('td', { 
                 text: t('noData'), 
                 attr: { colspan: 3, style: 'text-align:center; color: var(--text-muted);' }
             });
        }

        contentEl.createEl('hr', { attr: { style: 'margin: 20px 0; border-color: var(--background-modifier-border);' } });
        contentEl.createEl('h3', { text: t('aiTitle') });
        this.aiContainer = contentEl.createDiv({ cls: 'ai-summary-container' });
        
        this.aiContainer.createEl('p', { 
            text: t('aiClickToStart'), 
            attr: { style: 'color: var(--text-faint); font-style: italic;' } 
        });
	}

    async generateAISummary() {
        if (!this.settings.llmApiKey && !this.settings.llmEndpoint.includes('localhost')) {
            new Notice(t('aiApiKeyMissing'));
            return;
        }
        if (!this.rawContent.trim()) {
            new Notice(t('aiNoContent'));
            return;
        }

        this.aiContainer.empty();
        this.aiContainer.createDiv({ cls: 'ai-loading' }).createSpan({ text: t('aiLoading') });

        try {
            const summary = await this.callLLM(this.rawContent);
            this.aiContainer.empty();
            await MarkdownRenderer.render(this.app, summary, this.aiContainer, '', this.component);
        } catch (error) {
            this.aiContainer.empty();
            this.aiContainer.createEl('p', { 
                text: `${t('aiError')} ${(error as Error).message}`, 
                attr: { style: 'color: var(--text-error);' } 
            });
            console.error(error);
        }
    }

    async callLLM(content: string): Promise<string> {
        const { llmEndpoint, llmApiKey, llmModel, llmPrompt } = this.settings;
        let url = llmEndpoint;
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (!url.endsWith('chat/completions')) url = `${url}/chat/completions`;

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (llmApiKey) headers['Authorization'] = `Bearer ${llmApiKey}`;

        const body = {
            model: llmModel,
            messages: [
                { role: 'system', content: llmPrompt },
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
        
        const prevBtn = headerDiv.createEl('button', { cls: 'month-nav-btn', attr: { 'aria-label': '上个月' } });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => {
            this.currentDate.subtract(1, 'month');
            void this.renderContent();
        };
        
        const titleEl = headerDiv.createEl('h2', { text: `${this.currentDate.format('YYYY年MM月')} 时间线` });
        
        const nextBtn = headerDiv.createEl('button', { cls: 'month-nav-btn', attr: { 'aria-label': '下个月' } });
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

    async loadMonthData(): Promise<Array<{date: moment.Moment, items: Array<{time: string, content: string, category?: string, icon?: string}>}>> {
        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');
        const monthData: Array<{date: moment.Moment, items: Array<{time: string, content: string, category?: string, icon?: string}>}> = [];
        
        for (let day = startOfMonth.clone(); day.isSameOrBefore(endOfMonth); day.add(1, 'day')) {
            const filePath = this.getFilePath(day);
            const items: Array<{time: string, content: string, category?: string, icon?: string}> = [];
            
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

    parseTimelineFromContent(content: string): Array<{time: string, content: string, category?: string, icon?: string}> {
        const lines = content.split('\n');
        const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        const items: Array<{time: string, content: string, category?: string, icon?: string}> = [];
        
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

    renderWeeksGrid(container: HTMLElement, monthData: Array<{date: moment.Moment, items: Array<{time: string, content: string, category?: string, icon?: string}>}>) {
        // 构建完整的周数据结构
        const firstDay = monthData[0].date.clone();
        const lastDay = monthData[monthData.length - 1].date.clone();
        const firstMonday = firstDay.clone().startOf('isoWeek');
        const lastSunday = lastDay.clone().endOf('isoWeek');
        
        // 创建日期到数据的映射
        const dateMap = new Map<string, {date: moment.Moment, items: Array<{time: string, content: string, category?: string, icon?: string}>}>();
        monthData.forEach(d => {
            dateMap.set(d.date.format('YYYY-MM-DD'), d);
        });
        
        // 按周分组 - 二维数组 weeks[周索引][星期几索引]
        type DayData = {date: moment.Moment, items: Array<{time: string, content: string, category?: string, icon?: string}>} | null;
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
        
        // 用 colgroup 控制列宽 - 统一列宽
        const colgroup = table.createEl('colgroup');
        colgroup.createEl('col', { cls: 'month-timeline-weekday-col' }); // 星期几列，现在也是弹性宽度
        for (let w = 0; w < weeks.length; w++) {
            colgroup.createEl('col', { cls: 'month-timeline-week-col' }); // 各周列弹性分配
        }
        
        // 表头
        const thead = table.createEl('thead');
        const headerRow = thead.createEl('tr');
        headerRow.createEl('th', { cls: 'weekday-label', text: '' });
        
        for (let w = 0; w < weeks.length; w++) {
            const week = weeks[w];
            let start = '', end = '';
            for (let d = 0; d < 7; d++) {
                if (week[d]) {
                    if (!start) start = week[d]!.date.format('MM/DD');
                    end = week[d]!.date.format('MM/DD');
                }
            }
            const th = headerRow.createEl('th');
            th.createDiv({ text: `第${w + 1}周`, cls: 'week-label' });
            th.createDiv({ text: start && end ? `${start}-${end}` : '', cls: 'week-range' });
        }
        
        // 表体 - 7行(周一到周日)，每行有 weeks.length 列
        const tbody = table.createEl('tbody');
        const weekdayNames = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
        
        for (let d = 0; d < 7; d++) {
            const row = tbody.createEl('tr');
            row.createEl('td', { text: weekdayNames[d], cls: 'weekday-label' });
            
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
                dateLabel.textContent = dayData.date.format('DD日');
                if (isToday) dateLabel.addClass('today');
                
                if (dayData.items.length === 0) {
                    td.addClass('no-data');
                    td.createDiv({ cls: 'no-data-placeholder', text: '暂无记录' });
                    continue;
                }
                
                const dayList = td.createDiv({ cls: 'timeline-day-list' });
                dayData.items.forEach(item => {
                    const itemEl = dayList.createDiv({ cls: 'timeline-item' });
                    if (item.category) itemEl.addClass(`timeline-category-${item.category}`);
                    if (item.icon) {
                        const iconEl = itemEl.createDiv({ cls: 'timeline-icon' });
                        setIcon(iconEl, item.icon);
                    }
                    itemEl.createDiv({ cls: 'timeline-time', text: item.time });
                    itemEl.createDiv({ cls: 'timeline-content-text', text: item.content });
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
                text.setPlaceholder('System Prompt...')
                .setValue(this.plugin.settings.llmPrompt)
                .onChange(async (value: string) => { 
                    this.plugin.settings.llmPrompt = value; 
                    await this.plugin.saveSettings(); 
                });
                text.inputEl.rows = 6;
            });
	}
}