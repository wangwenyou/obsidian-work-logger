import { App, Setting, PluginSettingTab, Notice, ButtonComponent, setIcon } from 'obsidian';
import { t } from '../lang';
import type WorkLoggerPlugin from '../main';
import { sampleTaskTitles } from './utils';
import { DEFAULT_SETTINGS } from './types';

/**
 * 工作日志设置标签页
 */
export class WorkLoggerSettingTab extends PluginSettingTab {
    plugin: WorkLoggerPlugin;

    constructor(app: App, plugin: WorkLoggerPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

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

        // --- 分类管理 ---
        const catHeader = new Setting(containerEl).setHeading().setName(t('categoryConfigTitle'));
        catHeader.descEl.innerHTML = t('categoryConfigDesc');
        
        catHeader.addExtraButton(btn => btn
            .setIcon('rotate-ccw')
            .setTooltip(t('restoreDefaults') || 'Restore Defaults')
            .onClick(async () => {
                this.plugin.settings.categories = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.categories));
                await this.plugin.saveSettings();
                this.display();
                new Notice(t('restoreSuccess') || 'Categories restored to default');
            }));

        this.renderCategoryList(containerEl);

        new Setting(containerEl)
            .setName(t('aiGenCategories'))
            .setDesc(t('aiGenCategoriesDesc'))
            .addButton(btn => btn
                .setButtonText(t('genBtn'))
                .onClick(async () => {
                    await this.handleAIGenCategories(btn);
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

    renderCategoryList(containerEl: HTMLElement) {
        const catContainer = containerEl.createDiv({ cls: 'wl-category-setting-list' });
        
        this.plugin.settings.categories.forEach((cat, index) => {
            const s = new Setting(catContainer);
            
            // 图标显示容器
            const iconPreview = s.controlEl.createDiv({ cls: 'wl-cat-icon-preview' });
            setIcon(iconPreview, cat.icon || 'circle');
            if (cat.color) {
                iconPreview.style.color = cat.color;
                iconPreview.style.backgroundColor = `${cat.color}20`;
            }

            s.addText(text => text
                    .setPlaceholder(t('catName'))
                    .setValue(cat.name)
                    .onChange(async (val) => {
                        cat.name = val;
                        await this.plugin.saveSettings();
                    }))
                .addText(text => text
                    .setPlaceholder(t('catIcon'))
                    .setValue(cat.icon)
                    .onChange(async (val) => {
                        cat.icon = val;
                        iconPreview.empty();
                        setIcon(iconPreview, val || 'circle');
                        await this.plugin.saveSettings();
                    }))
                .addColorPicker(cp => cp
                    .setValue(cat.color || '#64748b')
                    .onChange(async (val) => {
                        cat.color = val;
                        iconPreview.style.color = val;
                        iconPreview.style.backgroundColor = `${val}20`;
                        await this.plugin.saveSettings();
                    }))
                .addText(text => text
                    .setPlaceholder(t('catPatterns'))
                    .setValue(cat.patterns)
                    .onChange(async (val) => {
                        cat.patterns = val;
                        await this.plugin.saveSettings();
                    }))
                .addExtraButton(btn => btn
                    .setIcon('trash')
                    .setTooltip(t('delete'))
                    .onClick(async () => {
                        this.plugin.settings.categories.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    }));
            
            s.controlEl.addClass('wl-category-row');
        });

        new Setting(containerEl)
            .addButton(btn => btn
                .setButtonText(t('addCategory'))
                .onClick(async () => {
                    this.plugin.settings.categories.push({
                        id: 'cat_' + Date.now(),
                        name: 'New Category',
                        icon: 'circle',
                        patterns: 'keywords'
                    });
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }

    async handleAIGenCategories(btn: ButtonComponent) {
        if (!this.plugin.settings.llmApiKey && !this.plugin.settings.llmEndpoint.includes('localhost')) {
            new Notice(t('aiApiKeyMissing'));
            return;
        }

        btn.setDisabled(true);
        btn.setButtonText(t('generating'));

        try {
            const samples = await sampleTaskTitles(this.app, this.plugin.settings.rootFolder, 150);
            if (samples.length === 0) {
                new Notice("No task logs found to analyze.");
                return;
            }

            const prompt = `你是一个专业的任务分类专家。下面是从用户工作日志中提取的任务标题采样：
${samples.join('\n')}

请根据这些任务内容，总结出一套最适合该用户的分类体系（建议 5-10 个分类）。
输出要求：
1. 必须返回合法的 JSON 数组，格式为：[{"id": "string", "name": "string", "icon": "string", "color": "hex_color", "patterns": "regex_string"}]
2. id 请使用英文（如 coding, meeting）。
3. name 请使用用户任务内容的语言（如 编码开发, 会议沟通）。
4. icon 必须是 Lucide 图标名称。
5. color 请提供一个美观的、有区分度的十六进制颜色值。
6. patterns 是正则表达式，用于匹配该分类的任务。
7. 最后一个分类应该是 id="work", name="常规工作", icon="briefcase", color="#64748b", patterns=".*" 作为兜底。
只返回 JSON 代码块，不要有其他解释说明。`;

            const result = await this.plugin.callLLM(samples.join('\n'), prompt);
            
            // 提取 JSON 内容
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const newCategories = JSON.parse(jsonMatch[0]);
                this.plugin.settings.categories = newCategories;
                await this.plugin.saveSettings();
                new Notice(t('genSuccess'));
                this.display();
            } else {
                throw new Error("AI returned invalid JSON format.");
            }
        } catch (e) {
            new Notice(t('genFailed') + e.message);
            console.error(e);
        } finally {
            btn.setDisabled(false);
            btn.setButtonText(t('genBtn'));
        }
    }
}
