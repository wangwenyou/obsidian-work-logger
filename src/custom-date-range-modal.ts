import { App, Modal, Setting, Notice, moment } from 'obsidian';
import { t } from '../lang';
import type WorkLoggerPlugin from '../main';

/**
 * 自定义日期范围弹窗类
 * 用于选择自定义时间范围生成报告
 */
export class CustomDateRangeModal extends Modal {
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
