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
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('work-logger-container');

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

		const startOfMonth = this.currentDate.clone().startOf('month');
		const dayIterator = startOfMonth.clone().subtract(startOfMonth.isoWeekday() - 1, 'days');
        
		for (let week = 0; week < 6; week++) {
            const weekStart = dayIterator.clone();
			const weekBtn = grid.createDiv({ cls: 'week-stat-btn', attr: {'aria-label': t('weekStatTooltip')} });
            setIcon(weekBtn, "bar-chart-3"); 
			weekBtn.onclick = (e) => { e.stopPropagation(); void this.generateWeekReport(weekStart); };

			for (let d = 0; d < 7; d++) {
				const dayStr = dayIterator.format('D');
                const isCurrentMonth = dayIterator.month() === this.currentDate.month();
                const targetDate = dayIterator.clone();
                const isToday = dayIterator.isSame(moment(), 'day');

				const cell = grid.createDiv({ cls: `day-cell ${isToday ? 'today' : ''}` });
                if (!isCurrentMonth) cell.addClass('other-month');

                if (this.existingDates.has(targetDate.format('YYYY-MM-DD'))) {
                    cell.addClass('has-data');
                }

				cell.createDiv({ cls: 'day-number' }).createSpan({ text: dayStr });

                const markersContainer = cell.createDiv({ cls: 'markers' });
                const checkIcon = markersContainer.createDiv({ cls: 'marker task-check' });
                setIcon(checkIcon, 'check'); 
                
				cell.onclick = () => { void this.openDailyNote(targetDate); };
				dayIterator.add(1, 'day');
			}
		}

        this.tasksContainer = container.createDiv({ cls: 'tasks-container' });
        void this.renderIncompleteTasks();
	}

    async renderIncompleteTasks() {
        this.tasksContainer.empty();
        const tasks = await this.scanMonthForIncompleteTasks();

        if (tasks.length === 0) {
            return;
        }

        this.tasksContainer.createEl('h3', { text: t('monthTasksTitle'), cls: 'tasks-header' });
        const listEl = this.tasksContainer.createEl('ul', { cls: 'task-list' });

        const uniqueTasks = new Map<string, { task: string, path: string }>();
        tasks.forEach(task => {
            if (!uniqueTasks.has(task.task)) {
                uniqueTasks.set(task.task, task);
            }
        });

        uniqueTasks.forEach(task => {
            const itemEl = listEl.createEl('li', { cls: 'task-item', text: task.task });
            itemEl.onclick = () => {
                void this.app.workspace.openLinkText(task.path, '');
            };
        });
    }

    async scanMonthForIncompleteTasks(): Promise<{ task: string, path: string }[]> {
        const tasks: { task: string, path: string }[] = [];
        const month = this.currentDate.month();
        const year = this.currentDate.year();
        const daysInMonth = this.currentDate.daysInMonth();
        const taskRegex = /^\s*-\s*\[\s\]\s*(.+)/gm;

        for (let i = 1; i <= daysInMonth; i++) {
            const date = moment({ year, month, day: i });
            const filePath = this.getFilePath(date);

            if (await this.app.vault.adapter.exists(filePath)) {
                try {
                    const content = await this.app.vault.adapter.read(filePath);
                    let match;
                    while ((match = taskRegex.exec(content)) !== null) {
                        tasks.push({ task: match[1].trim(), path: filePath });
                    }
                } catch (e) {
                    console.error(`Work Logger: Could not read file ${filePath}`, e);
                }
            }
        }
        return tasks;
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