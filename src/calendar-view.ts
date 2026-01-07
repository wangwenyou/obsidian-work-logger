import { ItemView, WorkspaceLeaf, TFile, setIcon, Notice, moment } from 'obsidian';
import { t } from '../lang';
import type WorkLoggerPlugin from '../main';
import type { TimelineItem, DayData, TaskInfo } from './types';
import { getTaskCategory, formatDuration, parseDailyContent, parseTimelineFromContent, scanTasksForMonth, fetchAndCacheExistingFiles } from './utils';
import { ReportModal } from './report-modal';
import { MonthTimelineModal } from './month-timeline-modal';
import { preloadHolidays, getDayDisplayType, formatHolidayName, HolidayInfo } from './holidays';
import { RecurringScheduleModal, getSchedulesForDate, generateScheduleContent } from './recurring';

/**
 * 日历视图类
 * 插件的主视图，展示日历、任务列表和时间线
 */
export class CalendarView extends ItemView {
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

    getViewType() { return 'work-logger-calendar'; }
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
        // 预加载节假日数据
        const currentYear = this.currentDate.year();
        await preloadHolidays([currentYear - 1, currentYear, currentYear + 1]);

        // === 现代化头部 ===
        const header = container.createDiv({ cls: 'calendar-header-modern' });

        // 左侧：日历徽章图标
        const calendarBadge = header.createDiv({ cls: 'calendar-badge' });
        setIcon(calendarBadge, 'calendar');

        // 中间：月份标题
        const titleEl = header.createEl('h3', {
            cls: 'calendar-title',
            text: this.currentDate.format(t('dateFormat'))
        });

        // 右侧：胶囊状导航组
        const navGroup = header.createDiv({ cls: 'calendar-nav-group' });

        // 周期性日程按钮
        const recurringBtn = navGroup.createEl('button', {
            cls: 'nav-btn recurring-btn',
            attr: { 'aria-label': t('recurringSchedules') || '周期性日程' }
        });
        setIcon(recurringBtn, 'alarm-clock');
        recurringBtn.onclick = () => { this.openRecurringModal(); };

        // 上一月按钮
        const prevBtn = navGroup.createEl('button', {
            cls: 'nav-btn',
            attr: { 'aria-label': t('prevMonth') }
        });
        setIcon(prevBtn, 'chevron-left');
        prevBtn.onclick = () => { this.currentDate.subtract(1, 'month'); void this.renderCalendar(); };

        // 回到今天按钮
        const todayBtn = navGroup.createEl('button', {
            cls: 'nav-btn today-btn',
            attr: { 'aria-label': t('goToToday') || '回到今天' }
        });
        setIcon(todayBtn, 'rotate-ccw');
        todayBtn.onclick = () => {
            this.currentDate = moment();
            void this.renderCalendar();
        };

        // 下一月按钮
        const nextBtn = navGroup.createEl('button', {
            cls: 'nav-btn',
            attr: { 'aria-label': t('nextMonth') }
        });
        setIcon(nextBtn, 'chevron-right');
        nextBtn.onclick = () => { this.currentDate.add(1, 'month'); void this.renderCalendar(); };

        this.existingDates = await fetchAndCacheExistingFiles(this.app, this.plugin.settings.rootFolder, this.currentDate);

        const grid = container.createDiv({ cls: 'calendar-grid' });

        // Add empty corner cell for alignment with week-stat buttons
        grid.createDiv({ cls: 'day-header' });

        // 周日期头（周六日显示淡红色）
        const weekdayLabels = t('weekdaysShort').split(',');
        weekdayLabels.forEach((dayName, index) => {
            const headerCell = grid.createDiv({ cls: 'day-header', text: dayName });
            // index 5=周六, 6=周日 (基于周一开始)
            if (index === 5 || index === 6) {
                headerCell.addClass('weekend-header');
            }
        });

        // 优化日历显示逻辑：只显示包含本月日期的周
        const startOfMonth = this.currentDate.clone().startOf('month');
        const endOfMonth = this.currentDate.clone().endOf('month');

        // 找到第一周的开始（周一）
        const firstWeekStart = startOfMonth.clone().startOf('isoWeek');
        // 找到最后一周的结束（周日）
        const lastWeekEnd = endOfMonth.clone().endOf('isoWeek');

        const dayIterator = firstWeekStart.clone();

        while (dayIterator.isSameOrBefore(lastWeekEnd, 'day')) {
            const weekStart = dayIterator.clone();

            // 检查当周是否有数据
            let hasWeekData = false;
            for (let i = 0; i < 7; i++) {
                const checkDate = weekStart.clone().add(i, 'days').format('YYYY-MM-DD');
                if (this.existingDates.has(checkDate)) {
                    hasWeekData = true;
                    break;
                }
            }

            // 添加周统计按钮（占位符始终存在以维持网格布局）
            const weekBtn = grid.createDiv({ cls: 'week-stat-btn' });
            if (hasWeekData) {
                weekBtn.setAttribute('aria-label', t('weekStatTooltip'));
                setIcon(weekBtn, "bar-chart-3");
                weekBtn.onclick = (e) => { e.stopPropagation(); void this.generateWeekReport(weekStart); };
            }

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

                // 获取节假日信息并渲染
                this.renderDayCellWithHoliday(cell, targetDate, dayStr, d);

                // 添加数据标记（小圆点）
                if (this.existingDates.has(targetDate.format('YYYY-MM-DD'))) {
                    cell.createDiv({ cls: 'event-mark' });
                }

                // 所有日期都可以点击，包括其他月份的日期
                cell.onclick = () => { void this.openDailyNote(targetDate); };
                dayIterator.add(1, 'day');
            }
        }
    }

    /**
     * 渲染带节假日信息的日期单元格
     */
    async renderDayCellWithHoliday(cell: HTMLElement, date: moment.Moment, dayStr: string, weekdayIndex: number) {
        const displayInfo = await getDayDisplayType(date);
        const dayNumberEl = cell.createDiv({ cls: 'day-number' });
        const daySpan = dayNumberEl.createSpan({ text: dayStr });

        // 根据类型添加样式
        if (displayInfo.type === 'holiday') {
            cell.addClass('holiday-day');
            // 添加休字徽章
            const badge = cell.createDiv({ cls: 'holiday-badge rest-badge' });
            if (displayInfo.holidayInfo?.name) {
                badge.textContent = formatHolidayName(displayInfo.holidayInfo.name, 2) || '休';
                cell.setAttribute('aria-label', displayInfo.holidayInfo.name);
                cell.title = displayInfo.holidayInfo.name;
            } else {
                badge.textContent = '休';
            }
        } else if (displayInfo.type === 'workday') {
            cell.addClass('workday-day');
            // 添加班字徽章
            const badge = cell.createDiv({ cls: 'holiday-badge work-badge' });
            badge.textContent = '班';
            if (displayInfo.holidayInfo?.name) {
                cell.setAttribute('aria-label', displayInfo.holidayInfo.name + ' 补班');
                cell.title = displayInfo.holidayInfo.name + ' 补班';
            }
        } else if (displayInfo.type === 'weekend') {
            // 普通周末：日期数字显示淡红色
            daySpan.addClass('weekend-day-number');
        }
    }

    /**
     * 打开周期性日程管理弹窗
     */
    openRecurringModal() {
        const schedules = this.plugin.settings.recurringSchedules || [];
        new RecurringScheduleModal(
            this.app,
            this.plugin,
            schedules,
            async (newSchedules) => {
                this.plugin.settings.recurringSchedules = newSchedules;
                await this.plugin.saveSettings();
            }
        ).open();
    }

    async updateWeekTimeline() {
        // 使用当前选择的日期所在周
        const startOfWeek = this.currentDate.clone().startOf('isoWeek');
        const endOfWeek = this.currentDate.clone().endOf('isoWeek');

        const weekData: DayData[] = [];

        for (let day = startOfWeek.clone(); day.isSameOrBefore(endOfWeek); day.add(1, 'day')) {
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

            if (items.length > 0) {
                weekData.push({ date: day.clone(), items });
            }
        }

        this.renderWeekTimeline(weekData);
    }

    renderWeekTimeline(weekData: DayData[]) {
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
            const dayText = isToday ? t('today') : dayData.date.format(t('dateDayFormat') === 'DD' ? 'MMM DD' : 'MM月DD日');
            const weekdayText = dayData.date.locale(window.localStorage.getItem('language') || 'en').format('dddd');
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

                const textGroup = itemEl.createDiv({ cls: 'timeline-text-group' });
                textGroup.createDiv({ cls: 'timeline-content-text', text: item.content });
                if (item.description) {
                    textGroup.createDiv({ cls: 'timeline-description-text', text: item.description });
                }

                if (item.duration) {
                    itemEl.createDiv({ cls: 'timeline-duration', text: item.duration });
                }
            });
        });
    }

    async renderIncompleteTasks() {
        this.tasksContainer.empty();

        // 渲染本月任务标题和列表
        const headerRow = this.tasksContainer.createDiv({ cls: 'tasks-header-row', attr: { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' } });
        const headerLeft = headerRow.createDiv({ attr: { style: 'display: flex; align-items: center; gap: 8px;' } });
        setIcon(headerLeft.createSpan({ cls: 'header-icon' }), 'check-square');
        headerLeft.createEl('h3', { text: t('monthTasksTitle'), attr: { style: 'margin: 0; font-size: 0.95rem;' } });

        const listEl = this.tasksContainer.createDiv({ cls: 'task-list' });

        const tasks = await scanTasksForMonth(this.app, this.plugin.settings.rootFolder, this.currentDate);

        if (tasks.length === 0) {
            const emptyDiv = listEl.createDiv({ cls: 'tasks-empty' });
            emptyDiv.createSpan({ text: t('noIncompleteTasks') || '本月没有未完成的任务！' });
        } else {
            const uniqueTasks = new Map<string, TaskInfo>();
            tasks.forEach(task => {
                if (!uniqueTasks.has(task.task)) {
                    uniqueTasks.set(task.task, task);
                }
            });

            uniqueTasks.forEach(task => {
                const cardEl = listEl.createDiv({ cls: 'task-card' });
                cardEl.createDiv({ cls: 'checkbox' });

                const contentEl = cardEl.createDiv({ cls: 'task-content' });
                contentEl.createDiv({ cls: 'task-text', text: task.task });

                const fileName = task.path.split('/').pop()?.replace('.md', '') || '';
                let label = fileName;

                const pathParts = task.path.split('/');
                if (pathParts.length >= 2) {
                    const monthStr = pathParts[pathParts.length - 2];
                    const dayStr = pathParts[pathParts.length - 1].replace('.md', '');
                    if (monthStr.length === 6 && dayStr.length === 2) {
                        label = `${monthStr.substring(4)}-${dayStr}`;
                    }
                }

                contentEl.createDiv({ cls: 'task-meta', text: label });
                cardEl.onclick = () => { void this.app.workspace.openLinkText(task.path, ''); };
            });
        }

        // 检查上个月
        const prevMonthDate = this.currentDate.clone().subtract(1, 'month');
        const prevTasks = await scanTasksForMonth(this.app, this.plugin.settings.rootFolder, prevMonthDate);

        if (prevTasks.length > 0) {
            const migrateBtn = headerRow.createEl('button', {
                cls: 'migrate-btn',
                attr: {
                    'aria-label': t('migrateTasks')
                }
            });
            setIcon(migrateBtn, 'import');

            migrateBtn.onclick = async () => {
                await this.migrateTasksToToday(prevTasks);
            };
        }
    }

    async migrateTasksToToday(tasks: TaskInfo[]) {
        const uniqueTasks = [...new Set(tasks.map(t => t.task))];
        if (uniqueTasks.length === 0) return;

        const today = moment();
        const todayPath = this.getFilePath(today);

        const folderPath = todayPath.substring(0, todayPath.lastIndexOf('/'));
        if (!(await this.app.vault.adapter.exists(folderPath))) {
            await this.app.vault.createFolder(folderPath);
        }

        let file = this.app.vault.getAbstractFileByPath(todayPath);
        if (!file) {
            await this.openDailyNote(today);
            await new Promise(r => setTimeout(r, 100)); // wait for creation
            file = this.app.vault.getAbstractFileByPath(todayPath);
        }

        if (file instanceof TFile) {
            const content = await this.app.vault.read(file);
            let newContent = content;
            if (!newContent.endsWith('\n')) newContent += '\n';

            newContent += `\n### ${t('migrateTasks')} (${uniqueTasks.length})\n`;
            uniqueTasks.forEach(task => {
                newContent += `- [ ] ${task}\n`;
            });

            await this.app.vault.modify(file, newContent);
            new Notice(t('migratedCount').replace('{{n}}', String(uniqueTasks.length)));
            void this.renderIncompleteTasks();
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
        let isNewFile = false;

        if (!file) {
            isNewFile = true;
            // 生成模板内容
            let templateStr = t('dailyNoteTemplate');

            // 获取该日期适用的周期性日程
            const schedules = this.plugin.settings.recurringSchedules || [];
            const applicableSchedules = getSchedulesForDate(schedules, date);

            if (applicableSchedules.length > 0) {
                const scheduleContent = generateScheduleContent(applicableSchedules);
                // 寻求 {{startTime}} 占位符所在行的结尾
                const startTimeMarker = '{{startTime}}';
                const markerPos = templateStr.indexOf(startTimeMarker);

                let insertPos = -1;
                if (markerPos !== -1) {
                    const lineEnd = templateStr.indexOf('\n', markerPos);
                    if (lineEnd !== -1) {
                        insertPos = lineEnd + 1;
                    } else {
                        insertPos = templateStr.length;
                        if (!templateStr.endsWith('\n')) templateStr += '\n';
                    }
                }

                if (insertPos !== -1) {
                    templateStr = templateStr.slice(0, insertPos) + scheduleContent + templateStr.slice(insertPos);
                } else {
                    // 降级方案：直接追加
                    templateStr += '\n' + scheduleContent;
                }
            }

            // 之后再执行占位符替换
            templateStr = templateStr
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
                parseDailyContent(content, taskStats);
                fullWeekContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
            }
        }

        new ReportModal(this.app, this.plugin, taskStats, weekStart, this.plugin.settings, fullWeekContent).open();
    }
}
