import { Plugin, WorkspaceLeaf, TFile, Notice, requestUrl, moment, Editor, MarkdownView } from 'obsidian';
import { t } from './lang';
import { VIEW_TYPE_CALENDAR, DEFAULT_SETTINGS, WorkLoggerSettings } from './src/types';
import { parseDailyContent, getFilePath, getTaskCategory, scanTasksForMonth, getAdjustedWeekRange } from './src/utils';
import { CalendarView } from './src/calendar-view';
import { ReportModal } from './src/report-modal';
import { CustomDateRangeModal } from './src/custom-date-range-modal';
import { WorkLoggerSettingTab } from './src/setting-tab';
import { WorkLoggerIndexer } from './src/indexer';
import { invokeMCP } from './src/mcp';

/**
 * Work Logger 插件主类
 */
export default class WorkLoggerPlugin extends Plugin {
    settings: WorkLoggerSettings;
    indexer: WorkLoggerIndexer;

    async onload() {
        await this.loadSettings();
        
        // 初始化索引器
        this.indexer = new WorkLoggerIndexer(this);
        await this.indexer.loadIndex();
        
        // 首次加载如果索引为空，进行一次全量扫描，或者强制扫描
        // const indexEmpty = Object.keys(await this.app.vault.adapter.exists(this.manifest.dir + '/data-index.json') ? 
        //     JSON.parse(await this.app.vault.adapter.read(this.manifest.dir + '/data-index.json')) : {}).length === 0;
        
        // 插件加载时强制进行一次全量扫描，确保索引最新
        void this.indexer.fullScan();

        // 每日主动分析
        void this.checkAndRunProactiveAi();

        // 监听文件变化
        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile) {
                void this.indexer.indexFile(file);
            }
        }));

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

    /**
     * 获取今日当前正在进行的任务
     */
    async getActiveTask(): Promise<{ title: string, startTime: moment.Moment } | null> {
        const today = moment();
        const filePath = getFilePath(this.settings.rootFolder, today);
        const file = this.app.vault.getAbstractFileByPath(filePath);

        if (!(file instanceof TFile)) return null;

        const content = await this.app.vault.read(file);
        const lines = content.split('\n');
        const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
        
        let lastPastEntry: { title: string, startTime: moment.Moment } | null = null;

        for (const line of lines) {
            const match = line.match(timeRegex);
            if (match) {
                const startTime = moment(match[1], 'HH:mm');
                startTime.year(today.year()).month(today.month()).date(today.date());
                const title = match[2].trim();

                // 仅考虑当前时间及之前的条目
                if (startTime.isSameOrBefore(today)) {
                    lastPastEntry = { title, startTime };
                }
            }
        }

        // 如果最后一条过去条目存在，且不是下班/结束，则为活动任务
        if (lastPastEntry && !lastPastEntry.title.includes('下班') && !lastPastEntry.title.includes('结束')) {
            return lastPastEntry;
        }

        return null;
    }

    async generateCustomReport(startDate: moment.Moment, endDate: moment.Moment) {
        // 如果是本周报告，则应用调整后的周范围
        let actualStart = startDate;
        let actualEnd = endDate;
        if (moment().isSame(startDate, 'isoWeek') && moment().isSame(endDate, 'isoWeek')) {
            const { start, end } = await getAdjustedWeekRange(moment());
            actualStart = start;
            actualEnd = end;
        }

        // 优先从索引获取统计数据
        const taskStats = this.indexer.getStatsInRange(actualStart, actualEnd);
        let fullContent = "";

        const days = actualEnd.diff(actualStart, 'days') + 1;
        
        for (let i = 0; i < days; i++) {
            const date = actualStart.clone().add(i, 'days');
            const filePath = getFilePath(this.settings.rootFolder, date);
            const file = this.app.vault.getAbstractFileByPath(filePath);

            if (file instanceof TFile) {
                if (days <= 31) { // 限制 fullContent 长度，避免 LLM 上下文溢出
                    const content = await this.app.vault.read(file);
                    fullContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
                }
            }
        }

        new ReportModal(this.app, this, actualStart, this.settings, fullContent, actualEnd).open();
    }

    getFilePath(date: moment.Moment): string {
        return getFilePath(this.settings.rootFolder, date);
    }

    parseDailyContent(content: string, stats: Record<string, number>) {
        parseDailyContent(content, stats);
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

    async checkAndRunProactiveAi(force = false) {
        const today = moment();
        const todayStr = today.format('YYYY-MM-DD');
        const lastRun = this.settings.lastAiSuggestion?.date;

        if (!force) {
            // 如果今天已经生成过，或是周末，则跳过
            if (todayStr === lastRun || [0, 6].includes(today.day())) return;
            
            // 检查是否已到用户配置的上班时间
            const startTime = moment(this.settings.defaultStartTime, 'HH:mm');
            if (today.isBefore(startTime)) return;
        }

        try {
            // 专门提取过去 2 天的工作记录
            const day1 = moment().subtract(1, 'day');
            const day2 = moment().subtract(2, 'days');
            const stats1 = this.indexer.getStatsInRange(day1, day1);
            const stats2 = this.indexer.getStatsInRange(day2, day2);
            
            const recentTasks = [...Object.keys(stats2), ...Object.keys(stats1)].slice(-8);
            
            // 获取 MCP 上下文（如果配置了）
            let mcpContext = "无";
            if (this.settings.mcpUrl) {
                try {
                    mcpContext = await invokeMCP(this, "请提供一份简短的待办事项摘要");
                } catch(e) {
                    console.warn("MCP call for daily tip failed:", e.message);
                }
            }
            
            const context = `OA待办摘要: ${mcpContext}\n\n最近两天的任务: ${recentTasks.join(', ')}`;
            
            const prompt = "你是一个聪明的助理。请结合用户的OA待办摘要和最近完成的任务，给出一句最关键的今日开工提醒。要求：1.语气像秘书，专业且简练；2.建议要能关联OA与实际工作；3.总共不超过 35 个字；4.直接输出正文，不带任何格式。";
            
            let suggestion = await this.callLLM(context, prompt);
            suggestion = suggestion.trim().replace(/\n/g, " ");
            
            this.settings.lastAiSuggestion = {
                content: suggestion,
                date: todayStr
            };

            // --- 同步生成近 7 天优化建议 ---
            try {
                const weekStart = moment().subtract(7, 'days');
                const weekEnd = moment().subtract(1, 'day');
                const weekStats = this.indexer.getStatsInRange(weekStart, weekEnd);
                
                let weekStatsText = "";
                Object.entries(weekStats).forEach(([name, hours]) => {
                    weekStatsText += `- ${name}: ${hours.toFixed(1)}h\n`;
                });

                if (weekStatsText) {
                    const weekPrompt = "你是一个专业的时间管理顾问。分析用户过去7天的工作数据，给出 3 条极简优化建议。要求：1.每条必须限制在 20 字以内且严禁换行；2.必须根据数据波动（如某类任务激增）给建议；3.直接给行动建议；4.Markdown 列表。";
                    const weeklyAdvice = await this.callLLM(weekStatsText, weekPrompt);
                    this.settings.lastWeeklyOptimization = weeklyAdvice.trim();
                    console.log("Work Logger: Weekly optimization generated.");
                }
            } catch (e) {
                console.error("Work Logger: Weekly optimization failed", e);
            }

            await this.saveSettings();
            
            if (!force) {
                const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_CALENDAR);
                leaves.forEach(l => (l.view as CalendarView).onOpen());
            }
        } catch (e) {
            console.error("Work Logger: Proactive AI failed", e);
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
        workspace.revealLeaf(leaf!);    }
}
