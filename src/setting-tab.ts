   import { App, Setting, PluginSettingTab, Notice, ButtonComponent, setIcon } from 'obsidian';
   import { t } from '../lang';
   import type WorkLoggerPlugin from '../main';
   import { sampleTaskTitles } from './utils';
   import { DEFAULT_SETTINGS } from './types';

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
                       if (!isNaN(num)) { this.plugin.settings.hoursPerDay = num; await this.plugin.saveSettings(); }
                   }));
           
           new Setting(containerEl).setName(t('defaultStartTime')).setDesc(t('defaultStartTimeDesc'))
               .addText(text => text.setPlaceholder('09:00').setValue(this.plugin.settings.defaultStartTime)
                   .onChange(async (value) => { this.plugin.settings.defaultStartTime = value; await this.plugin.saveSettings(); }));
           
           new Setting(containerEl).setName(t('defaultEndTime')).setDesc(t('defaultEndTimeDesc'))
               .addText(text => text.setPlaceholder('18:00').setValue(this.plugin.settings.defaultEndTime)
                   .onChange(async (value) => { this.plugin.settings.defaultEndTime = value; await this.plugin.saveSettings(); }));

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
           
           this.renderCategoryList(containerEl); // 这里的调用是关键

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
               .addText(text => text.setPlaceholder('https://...').setValue(this.plugin.settings.llmEndpoint)
                   .onChange(async (value) => { this.plugin.settings.llmEndpoint = value; await this.plugin.saveSettings(); }));
           new Setting(containerEl).setName(t('apiKey')).setDesc(t('apiKeyDesc'))
               .addText(text => text.setPlaceholder('sk-...')
                   .setValue(this.plugin.settings.llmApiKey)
                   .onChange(async (value) => { this.plugin.settings.llmApiKey = value; await this.plugin.saveSettings(); }));
           new Setting(containerEl).setName(t('modelName')).setDesc(t('modelNameDesc'))
               .addText(text => text.setPlaceholder('gemini-2.5-flash')
                   .setValue(this.plugin.settings.llmModel)
                   .onChange(async (value) => { this.plugin.settings.llmModel = value; await this.plugin.saveSettings(); }));

           new Setting(containerEl).setHeading().setName(t('maintenanceTitle'));
           new Setting(containerEl).setName(t('rebuildIndex')).setDesc(t('rebuildIndexDesc'))
               .addButton(btn => btn.setButtonText(t('rebuildNow')).onClick(async () => {
                   btn.setDisabled(true).setButtonText(t('rebuilding')); new Notice(t('rebuilding'));
                   await this.plugin.indexer.fullScan();
                   new Notice(t('rebuildSuccess')); btn.setDisabled(false).setButtonText(t('rebuildNow'));
               }));
           
           new Setting(containerEl).setHeading().setName("Integrations");
           containerEl.createEl('p', { text: '配置一个外部服务地址 (MCP)。插件将通过自然语言向该地址发送请求（如：“帮我总结待办”），您的服务在理解并处理后返回结果。', cls: 'setting-item-description' });
           new Setting(containerEl).setName("MCP Service URL")
               .addText(text => text.setPlaceholder('http://localhost:8000/mcp').setValue(this.plugin.settings.mcpUrl || '')
                   .onChange(async (value) => { 
                       (this.plugin.settings as any).mcpUrl = value ? value : undefined; 
                       await this.plugin.saveSettings(); 
                       this.display(); 
                   }));
           
           if (this.plugin.settings.mcpUrl) {
               new Setting(containerEl).setName("MCP Request Method").setDesc("The HTTP method to use for the request.")
                   .addDropdown(dropdown => dropdown.addOption('POST', 'POST').addOption('GET', 'GET').setValue(this.plugin.settings.mcpMethod || 'POST')
                       .onChange(async (value: 'GET' | 'POST') => { (this.plugin.settings as any).mcpMethod = value; await this.plugin.saveSettings(); }));
               new Setting(containerEl).setName("MCP Request Headers").setDesc("Optional: JSON format headers for authorization.")
                   .addTextArea(text => { text.setPlaceholder('{"Authorization":"Bearer ..."}').setValue(this.plugin.settings.mcpHeaders || '')
                       .onChange(async (value) => { (this.plugin.settings as any).mcpHeaders = value ? value : undefined; await this.plugin.saveSettings(); });
                       text.inputEl.rows = 3; text.inputEl.style.width = '100%';
                   });

               new Setting(containerEl).setName("MCP Modal Title").setDesc("自定义 MCP 弹窗标题。")
                   .addText(text => text.setPlaceholder('智能助理').setValue(this.plugin.settings.mcpModalTitle)
                       .onChange(async (value) => { this.plugin.settings.mcpModalTitle = value; await this.plugin.saveSettings(); }));
               
               // MCP Custom Prompts
               containerEl.createEl('h4', { text: 'MCP Quick Prompts', cls: 'setting-item-heading' });
               
               const promptContainer = containerEl.createDiv({ cls: 'wl-mcp-prompts-list' });
               
               const renderPrompts = () => {
                   promptContainer.empty();
                   this.plugin.settings.mcpPrompts.forEach((p, index) => {
                       const row = new Setting(promptContainer);
                       row.controlEl.style.justifyContent = "flex-start";
                       row.controlEl.style.gap = "8px";
                       row.controlEl.style.width = "100%";

                       row.addText(text => text
                           .setPlaceholder('Label (e.g. Summarize)')
                           .setValue(p.label)
                           .onChange(async (val) => {
                               p.label = val;
                               await this.plugin.saveSettings();
                           }));
                       
                       row.addText(text => text
                           .setPlaceholder('Prompt (e.g. Summarize my todos)')
                           .setValue(p.prompt)
                           .onChange(async (val) => {
                               p.prompt = val;
                               await this.plugin.saveSettings();
                           }));
                           
                       const inputs = row.controlEl.querySelectorAll('input[type="text"]');
                       (inputs[0] as HTMLElement).style.width = '120px';
                       (inputs[1] as HTMLElement).style.flex = '1';

                       row.addExtraButton(btn => btn
                           .setIcon('trash')
                           .setTooltip('Delete Prompt')
                           .onClick(async () => {
                               this.plugin.settings.mcpPrompts.splice(index, 1);
                               await this.plugin.saveSettings();
                               renderPrompts(); // 重新渲染列表
                           }));
                   });

                   new Setting(promptContainer)
                       .addButton(btn => btn
                           .setButtonText('Add Prompt')
                           .onClick(async () => {
                               this.plugin.settings.mcpPrompts.push({ label: 'New Prompt', prompt: 'Prompt text...' });
                               await this.plugin.saveSettings();
                               renderPrompts(); // 重新渲染列表
                           }));
               };
               
               renderPrompts(); // 首次渲染列表
           }
       }

       renderCategoryList(containerEl: HTMLElement) {
           const catContainer = containerEl.createDiv({ cls: 'wl-category-setting-list' });
           
           this.plugin.settings.categories.forEach((cat, index) => {
               const s = new Setting(catContainer);
               
               const iconPreview = s.controlEl.createDiv({ cls: 'wl-cat-icon-preview' });
               setIcon(iconPreview, cat.icon || 'circle');
               if (cat.color) { iconPreview.style.color = cat.color; iconPreview.style.backgroundColor = `${cat.color}20`; }

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
                           this.display(); // 重新渲染列表
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
                       this.display(); // 重新渲染列表
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
                   new Notice("No task logs found.");
                   return;
               }

               const prompt = `你是一个专业的任务分类专家。下面是用户工作日志采样：\n${samples.join('\n')}\n\n请根据这些任务内容，总结出一套最适合该用户的分类体系（建议 5-10 个分类）。\n输出要求：\n1. 必须返回合法的 JSON 数组，格式为：[{"id": "string", "name": "string", "icon": "string", "color": "hex_color", "patterns": "regex_string"}]\n2. id 请使用英文（如 coding, meeting）。\n3. name 请使用用户任务内容的语言（如 编码开发, 会议沟通）。\n4. icon 必须是 Lucide 图标名称。\n5. color 请提供一个美观的、有区分度的十六进制颜色值。\n6. patterns 是正则表达式，用于匹配该分类的任务。\n7. 最后一个分类应该是 id="work", name="常规工作", icon="briefcase", color="#64748b", patterns=".*" 作为兜底。\n只返回 JSON 代码块，不要有其他解释说明。`;
               const result = await this.plugin.callLLM(samples.join('\n'), prompt);
               
               const jsonMatch = result.match(/\[[\s\S]*\]/);
               if (jsonMatch) {
                   this.plugin.settings.categories = JSON.parse(jsonMatch[0]);
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