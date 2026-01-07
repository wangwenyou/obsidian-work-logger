import { App, Modal, setIcon, TFile, moment } from 'obsidian';
import { t } from '../lang';
import type WorkLoggerPlugin from '../main';
import type { TimelineItem, DayData } from './types';
import { getTaskCategory, parseTimelineFromContent } from './utils';
import { preloadHolidays, getDayDisplayType, formatHolidayName } from './holidays';

/**
 * 月度时间线弹窗类
 * 按周网格展示整月的工作时间线
 */
export class MonthTimelineModal extends Modal {
    plugin: WorkLoggerPlugin;
    currentDate: moment.Moment;

    constructor(app: App, plugin: WorkLoggerPlugin, currentDate: moment.Moment) {
        super(app);
        this.plugin = plugin;
        this.currentDate = currentDate.clone();
    }

    async onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('wl-timeline-modal');
        contentEl.addClass('month-timeline-modal');

        // 设置弹窗宽度样式已迁移至 CSS

        // 预加载节假日数据
        const year = this.currentDate.year();
        await preloadHolidays([year, year - 1, year + 1]);

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
        await this.renderWeeksGrid(weeksContainer, monthData);
    }

    async loadMonthData(): Promise<DayData[]> {
        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');
        const monthData: DayData[] = [];

        for (let day = startOfMonth.clone(); day.isSameOrBefore(endOfMonth); day.add(1, 'day')) {
            const filePath = this.getFilePath(day);
            const items: TimelineItem[] = [];

            if (await this.app.vault.adapter.exists(filePath)) {
                try {
                    const content = await this.app.vault.adapter.read(filePath);
                    const parsedItems = parseTimelineFromContent(content, this.plugin.settings.categories);
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


    async renderWeeksGrid(container: HTMLElement, monthData: DayData[]) {
        // 构建完整的周数据结构
        const firstDay = monthData[0].date.clone();
        const lastDay = monthData[monthData.length - 1].date.clone();
        const firstMonday = firstDay.clone().startOf('isoWeek');
        const lastSunday = lastDay.clone().endOf('isoWeek');

        // 创建日期到数据的映射
        const dateMap = new Map<string, DayData>();
        monthData.forEach(d => {
            dateMap.set(d.date.format('YYYY-MM-DD'), d);
        });

        // 按周分组 - 二维数组 weeks[周索引][星期几索引]
        const weeks: (DayData | null)[][] = [];
        const currentDay = firstMonday.clone();

        while (currentDay.isSameOrBefore(lastSunday, 'day')) {
            const week: (DayData | null)[] = [];
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
                    if (!start) start = week[d]!.date.format('MM-DD');
                    end = week[d]!.date.format('MM-DD');
                }
            }
            const th = headerRow.createEl('th', { cls: 'month-week-header-cell' });
            th.createDiv({ text: t('weekLabel').replace('{{n}}', String(w + 1)), cls: 'week-label' });
            th.createDiv({ text: start && end ? `${start} ～ ${end}` : '', cls: 'week-range' });
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
                const dateLabelContainer = td.createDiv({ cls: 'date-label-container' });

                const dateLabel = dateLabelContainer.createDiv({ cls: 'date-label' });
                dateLabel.textContent = dayData.date.format(t('dateDayFormat'));
                if (isToday) dateLabel.addClass('today');

                // 添加节假日/补班信息
                const displayInfo = await getDayDisplayType(dayData.date);
                if (displayInfo.type === 'holiday') {
                    td.addClass('holiday-day');
                    const badge = td.createDiv({ cls: 'holiday-badge rest-badge' });
                    badge.textContent = displayInfo.holidayInfo?.name ? formatHolidayName(displayInfo.holidayInfo.name, 2) : '休';
                } else if (displayInfo.type === 'workday') {
                    td.addClass('workday-day');
                    const badge = td.createDiv({ cls: 'holiday-badge work-badge' });
                    badge.textContent = '班';
                } else if (displayInfo.type === 'weekend') {
                    dateLabel.addClass('weekend-day-number');
                }

                if (dayData.items.length === 0) {
                    td.addClass('no-data');
                    td.createDiv({ cls: 'no-data-placeholder', text: t('noDayData') });
                    continue;
                }

                const dayList = td.createDiv({ cls: 'timeline-day-list' });
                dayData.items.forEach(item => {
                    const isEndOfDay = item.content === '下班' || item.content === '结束工作';
                    const itemEl = dayList.createDiv({ cls: 'timeline-item' });

                    const catDef = this.plugin.settings.categories.find(c => c.id === item.category);

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
                        } else if (catDef?.color) {
                            iconEl.style.color = catDef.color;
                        }
                        setIcon(iconEl, iconName);
                    }

                    itemEl.createDiv({ cls: 'timeline-time', text: item.time });
                    if (!isEndOfDay) {
                        const textGroup = itemEl.createDiv({ cls: 'timeline-text-group' });
                        textGroup.createDiv({ cls: 'timeline-content-text', text: item.content });
                        if (item.description) {
                            textGroup.createDiv({ cls: 'timeline-description-text', text: item.description });
                        }
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
