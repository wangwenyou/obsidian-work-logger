import { Plugin, WorkspaceLeaf, TFile, Notice, requestUrl, moment, Editor, MarkdownView } from 'obsidian';
import { t } from './lang';
import { VIEW_TYPE_CALENDAR, DEFAULT_SETTINGS, WorkLoggerSettings } from './src/types';
import { parseDailyContent, getFilePath } from './src/utils';
import { CalendarView } from './src/calendar-view';
import { ReportModal } from './src/report-modal';
import { CustomDateRangeModal } from './src/custom-date-range-modal';
import { WorkLoggerSettingTab } from './src/setting-tab';

/**
 * Work Logger 插件主类
 */
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
            const filePath = getFilePath(this.settings.rootFolder, date);
            const file = this.app.vault.getAbstractFileByPath(filePath);

            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                parseDailyContent(content, taskStats);
                fullContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
            }
        }

        new ReportModal(this.app, this, taskStats, startDate, this.settings, fullContent, endDate).open();
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