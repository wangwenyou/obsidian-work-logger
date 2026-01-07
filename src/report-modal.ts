import { App, Modal, setIcon, TFile, Notice, MarkdownRenderer, Component, moment, Setting } from 'obsidian';
import { t } from '../lang';
import type { WorkLoggerSettings } from './types';
import type WorkLoggerPlugin from '../main';
import { CustomDateRangeModal } from './custom-date-range-modal';
import { getTaskCategory } from './utils';

/**
 * 报告弹窗类
 * 用于展示工作统计报告和 AI 生成的周报/月报/年报
 */
export class ReportModal extends Modal {
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
    selectedCategory: string | null = null;

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
        modalEl.addClass('wl-dashboard-modal');
        contentEl.addClass('work-logger-dashboard-modal');

        // 样式已迁移至 styles.css 中统一管理

        // 确保 contentEl 填满整个 modal 并允许内部滚动
        contentEl.style.height = '100%';
        contentEl.style.display = 'flex';
        contentEl.style.flexDirection = 'column';

        // 1. 极简单行头部 (直接挂载到 contentEl)
        const header = contentEl.createDiv({ cls: 'dashboard-header compact-row' });

        // 标题组 (不再包裹在 leftGroup 里)
        const titleGroup = header.createDiv({ cls: 'header-title-group' });
        const iconBox = titleGroup.createDiv({ cls: 'icon-box-mini' });
        setIcon(iconBox, 'bar-chart-3');
        titleGroup.createSpan({ cls: 'header-title-text', text: t('reportTitle') });

        const endD = this.endDate ? this.endDate : this.weekStart.clone().add(6, 'days');
        const weekRange = `${this.weekStart.format('YYYY-MM-DD')} ～ ${endD.format('YYYY-MM-DD')}`;

        // 创建一个包裹容器以便精准定位下拉面板
        const rangeWrapper = titleGroup.createDiv({ cls: 'header-range-wrapper' });
        const rangeContainer = rangeWrapper.createDiv({ cls: 'header-range-container' });
        const rangeText = rangeContainer.createSpan({ cls: 'header-range-text clickable', text: weekRange });
        setIcon(rangeContainer.createSpan({ cls: 'dropdown-icon' }), 'chevron-down');

        // 3. 轻量化日期选择下拉面板 (挂载到 rangeWrapper 下)
        const datePickerPanel = rangeWrapper.createDiv({ cls: 'inline-date-picker hidden' });

        rangeContainer.onclick = (e) => {
            e.stopPropagation();
            const isHidden = datePickerPanel.classList.contains('hidden');
            // 关闭所有其他可能的下拉面板（如果有的话）
            datePickerPanel.toggleClass('hidden', !isHidden);
        };

        // 面板内容：快捷按钮 + 原生选择器
        const pickerTop = datePickerPanel.createDiv({ cls: 'picker-shortcuts' });
        const shortcuts = [
            { label: t('thisWeek'), start: moment().startOf('isoWeek'), end: moment().endOf('isoWeek') },
            { label: t('lastWeek'), start: moment().subtract(1, 'week').startOf('isoWeek'), end: moment().subtract(1, 'week').endOf('isoWeek') },
            { label: t('thisMonth'), start: moment().startOf('month'), end: moment().endOf('month') }
        ];

        shortcuts.forEach(s => {
            const btn = pickerTop.createEl('button', { text: s.label, cls: 'shortcut-btn' });
            btn.onclick = () => {
                this.close();
                void this.plugin.generateCustomReport(s.start, s.end);
            };
        });

        const pickerBottom = datePickerPanel.createDiv({ cls: 'picker-custom' });
        const startInput = pickerBottom.createEl('input', { type: 'date', value: this.weekStart.format('YYYY-MM-DD'), cls: 'date-input' });
        pickerBottom.createSpan({ text: ' → ', cls: 'range-sep' });
        const endInput = pickerBottom.createEl('input', { type: 'date', value: endD.format('YYYY-MM-DD'), cls: 'date-input' });

        const applyBtn = pickerBottom.createEl('button', { cls: 'apply-btn' });
        setIcon(applyBtn, 'check');
        applyBtn.onclick = () => {
            const s = moment(startInput.value);
            const e = moment(endInput.value);
            if (s.isValid() && e.isValid()) {
                this.close();
                void this.plugin.generateCustomReport(s, e);
            }
        };

        // 点击外部关闭面板
        window.addEventListener('click', (e) => {
            if (!datePickerPanel.contains(e.target as Node) && !rangeContainer.contains(e.target as Node)) {
                datePickerPanel.addClass('hidden');
            }
        }, { once: true });

        // 底部留一个小间隙或者 Flex 布局处理，这里直接创建滚动区
        const scrollArea = contentEl.createDiv({ cls: 'dashboard-scroll-area' });

        // 2. 核心数据汇总区
        const statsGrid = scrollArea.createDiv({ cls: 'stats-grid' });
        let totalH = 0;
        Object.values(this.stats).forEach(h => totalH += h);

        const totalCard = statsGrid.createDiv({ cls: 'stat-card total-hours-card' });
        const totalHeader = totalCard.createDiv({ cls: 'total-card-header' });
        totalHeader.createSpan({ cls: 'card-label', text: 'TOTAL HOURS' });
        totalHeader.createSpan({ cls: 'card-value', text: totalH.toFixed(1) });

        // 左侧分类聚合展示 (带图标)
        const categoryStats: Record<string, { hours: number, icon: string }> = {};
        Object.entries(this.stats).forEach(([name, hours]) => {
            const { category, icon } = getTaskCategory(name, this.settings.categories);
            if (!categoryStats[category]) {
                categoryStats[category] = { hours: 0, icon };
            }
            categoryStats[category].hours += hours;
        });

        const catList = totalCard.createDiv({ cls: 'category-summary-list' });
        Object.entries(categoryStats)
            .sort((a, b) => b[1].hours - a[1].hours)
            .forEach(([catId, data]) => {
                const percentage = totalH > 0 ? (data.hours / totalH) * 100 : 0;
                if (percentage < 0.5) return;

                const isActive = this.selectedCategory === catId;
                const item = catList.createDiv({ cls: `cat-summary-item clickable ${isActive ? 'is-active' : ''}` });
                const iconBox = item.createDiv({ cls: 'cat-icon-mini' });
                setIcon(iconBox, data.icon);
                
                const catDef = this.settings.categories.find(c => c.id === catId);
                if (catDef?.color) {
                    iconBox.style.backgroundColor = `${catDef.color}20`; // 20% opacity background
                    iconBox.style.color = catDef.color;
                }

                const info = item.createDiv({ cls: 'cat-info' });
                const catName = catDef ? catDef.name : catId;
                info.createSpan({ cls: 'cat-label', text: catName });

                const val = item.createDiv({ cls: 'cat-value-group' });
                val.createSpan({ cls: 'cat-hours', text: `${data.hours.toFixed(1)}h` });
                val.createSpan({ cls: 'cat-percent', text: `${percentage.toFixed(0)}%` });

                item.onclick = (e) => {
                    e.stopPropagation();
                    this.selectedCategory = isActive ? null : catId;
                    this.onOpen();
                };
            });

        const distCard = statsGrid.createDiv({ cls: 'stat-card distribution-card' });
        const distHeader = distCard.createDiv({ cls: 'dist-header' });
        const selectedCatDef = this.settings.categories.find(c => c.id === this.selectedCategory);
        const distTitle = this.selectedCategory ? `${t('taskContent')} - ${selectedCatDef ? selectedCatDef.name : this.selectedCategory}` : t('taskContent');
        distHeader.createSpan({ cls: 'dist-title', text: distTitle }); // 显示详细任务内容

        const copyBtn = distHeader.createEl('button', { cls: 'icon-copy-btn', attr: { 'aria-label': t('copyStats') } });
        setIcon(copyBtn, 'copy');
        copyBtn.onclick = () => { void this.copyToClipboard(); };

        const progressBarGroup = distCard.createDiv({ cls: 'progress-bar-group' });

        // 右侧显示详细任务排名 - 增加筛选逻辑
        let filteredStats = Object.entries(this.stats);
        if (this.selectedCategory) {
            filteredStats = filteredStats.filter(([name]) => getTaskCategory(name, this.settings.categories).category === this.selectedCategory);
        }
        
        const sortedTasks = filteredStats.sort((a, b) => b[1] - a[1]);
        const displayTasks = sortedTasks.slice(0, 10);
        const colors = ['bg-indigo', 'bg-emerald', 'bg-blue', 'bg-amber', 'bg-purple', 'bg-rose', 'bg-cyan'];

        displayTasks.forEach(([name, hours], i) => {
            const percentage = totalH > 0 ? (hours / totalH) * 100 : 0;
            const item = progressBarGroup.createDiv({ cls: 'progress-item clickable-task' });
            item.setAttribute('aria-label', t('jumpToFile') || 'Jump to file');
            
            const info = item.createDiv({ cls: 'item-info' });

            info.createSpan({ cls: 'item-name', text: name });
            const statsSpan = info.createSpan({ cls: 'item-hours' });
            statsSpan.createSpan({ text: `${hours.toFixed(1)}h`, cls: 'hours-value' });
            statsSpan.createSpan({ text: ` (${percentage.toFixed(1)}%)`, cls: 'percentage-value' });

            const barBg = item.createDiv({ cls: 'bar-bg' });
            const barFill = barBg.createDiv({ cls: `bar-fill ${colors[i % colors.length]}` });
            barFill.style.width = `${percentage}%`;

            item.onclick = () => {
                void this.jumpToTaskFile(name);
            };
        });
        
        if (sortedTasks.length > 10) {
            const moreInfo = progressBarGroup.createDiv({ cls: 'more-tasks-info', text: `... ${t('moreTasks').replace('{{count}}', String(sortedTasks.length - 10))}` });
            moreInfo.style.fontSize = '0.8em';
            moreInfo.style.opacity = '0.6';
            moreInfo.style.textAlign = 'center';
            moreInfo.style.marginTop = '8px';
        } else if (sortedTasks.length === 0) {
            progressBarGroup.createDiv({ cls: 'no-tasks-info', text: t('noTasks') || 'No tasks found' });
        }

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

    async jumpToTaskFile(taskName: string) {
        const root = this.settings.rootFolder;
        const start = this.weekStart.clone();
        const end = this.endDate ? this.endDate.clone() : this.weekStart.clone().add(6, 'days');

        // 逆序检查每一天，找到最近出现该任务的文件
        for (let d = end.clone(); d.isSameOrAfter(start); d.subtract(1, 'day')) {
            const dateStr = d.format('YYYYMM');
            const dayStr = d.format('DD');
            const filePath = `${root}/${dateStr}/${dayStr}.md`;
            
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                const content = await this.app.vault.read(file);
                // 简单包含判断，或者可以使用更精准的正则
                if (content.includes(taskName)) {
                    const leaf = this.app.workspace.getLeaf('tab');
                    await leaf.openFile(file);
                    this.close();
                    return;
                }
            }
        }
        new Notice(t('taskFileNotFound') || 'Could not find the source file for this task');
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
        const categoryStats: Record<string, number> = {};
        let totalH = 0;
        Object.entries(this.stats).forEach(([name, hours]) => {
            totalH += hours;
            const { category } = getTaskCategory(name, this.settings.categories);
            const catDef = this.settings.categories.find(c => c.id === category);
            const catLabel = catDef ? catDef.name : category;
            categoryStats[catLabel] = (categoryStats[catLabel] || 0) + hours;
        });

        let clipboardText = `--- ${t('distributionTitle')} ---\n`;
        Object.entries(categoryStats).sort((a, b) => b[1] - a[1]).forEach(([name, hours]) => {
            const percentage = totalH > 0 ? (hours / totalH * 100).toFixed(1) : "0.0";
            clipboardText += `${name}:\t${hours.toFixed(1)}h\t(${percentage}%)\n`;
        });

        clipboardText += `\n--- ${t('taskContent')} ---\n`;
        clipboardText += `${t('taskContent')}\t${t('durationHours')}\t${t('durationDays')}\n`;
        for (const [task, hours] of Object.entries(this.stats)) {
            const days = (hours / this.settings.hoursPerDay).toFixed(2);
            clipboardText += `${task}\t${hours.toFixed(2)}\t${days}\n`;
        }
        clipboardText += `\n${t('total')}\t${totalH.toFixed(2)}h\t${(totalH / this.settings.hoursPerDay).toFixed(2)}d`;

        await navigator.clipboard.writeText(clipboardText);
        new Notice(t('copySuccess'));
    }

    onClose() {
        this.component.unload();
        this.contentEl.empty();
    }
}
