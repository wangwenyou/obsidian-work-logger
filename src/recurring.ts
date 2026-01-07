import { App, Modal, Setting, setIcon, moment } from 'obsidian';
import { t } from '../lang';
import type WorkLoggerPlugin from '../main';
import { ConfirmModal } from './confirm-modal';

/**
 * 周期性日程接口
 */
export interface RecurringSchedule {
    id: string;
    title: string;
    time: string;          // HH:mm 格式
    description: string;
    weekdays: number[];    // 1-7 代表周一到周日
    enabled: boolean;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

/**
 * 获取指定日期应该填充的日程
 */
export function getSchedulesForDate(schedules: RecurringSchedule[], date: moment.Moment): RecurringSchedule[] {
    const weekday = date.isoWeekday(); // 1=周一, 7=周日
    return schedules.filter(s => s.enabled && s.weekdays.includes(weekday));
}

/**
 * 生成日程内容文本
 */
export function generateScheduleContent(schedules: RecurringSchedule[]): string {
    if (schedules.length === 0) return '';

    // 按时间排序
    const sorted = [...schedules].sort((a, b) => a.time.localeCompare(b.time));

    let content = '';
    for (const schedule of sorted) {
        content += `- ${schedule.time} ${schedule.title}\n`;
        if (schedule.description.trim()) {
            // 描述行：缩进但不带连字符
            const lines = schedule.description.split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    content += `  ${line}\n`;
                }
            }
        }
    }

    return content;
}

/**
 * 周期性日程管理弹窗
 */
export class RecurringScheduleModal extends Modal {
    plugin: WorkLoggerPlugin;
    schedules: RecurringSchedule[];
    onSave: (schedules: RecurringSchedule[]) => void;

    constructor(app: App, plugin: WorkLoggerPlugin, schedules: RecurringSchedule[], onSave: (schedules: RecurringSchedule[]) => void) {
        super(app);
        this.plugin = plugin;
        // 深拷贝并确保字段存在
        this.schedules = JSON.parse(JSON.stringify(schedules)).map((s: Partial<RecurringSchedule>) => ({
            id: s.id || generateId(),
            title: s.title || '',
            time: s.time || '09:00',
            description: s.description || '',
            weekdays: Array.isArray(s.weekdays) ? s.weekdays : [],
            enabled: s.enabled !== false
        }));
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        contentEl.addClass('recurring-schedule-modal');

        modalEl.style.width = '800px';
        modalEl.style.maxWidth = '90vw';

        // 标题
        const header = contentEl.createDiv({ cls: 'recurring-header' });
        const titleGroup = header.createDiv({ cls: 'recurring-title-group' });
        const iconEl = titleGroup.createSpan({ cls: 'recurring-icon' });
        setIcon(iconEl, 'alarm-clock');
        titleGroup.createEl('h2', { text: t('recurringSchedules') || '周期性日程' });

        // 添加按钮
        const addBtn = header.createEl('button', { cls: 'recurring-add-btn' });
        setIcon(addBtn, 'plus');
        addBtn.createSpan({ text: t('addSchedule') || '添加日程' });
        addBtn.onclick = () => {
            this.schedules.push({
                id: generateId(),
                title: '',
                time: '09:00',
                description: '',
                weekdays: [], // 默认为空，不自动勾选
                enabled: true
            });
            this.renderScheduleList(listContainer);
            this.saveSchedules();
        };

        // 日程列表容器
        const listContainer = contentEl.createDiv({ cls: 'recurring-list' });
        this.renderScheduleList(listContainer);
    }

    renderScheduleList(container: HTMLElement) {
        container.empty();

        // 按照 1. 首发日 (weekdays最小值) 2. 时间 排序
        // 未设置具体日期的（如新添加）视为 0，排在最前
        this.schedules.sort((a, b) => {
            const minDayA = a.weekdays.length > 0 ? Math.min(...a.weekdays) : 0;
            const minDayB = b.weekdays.length > 0 ? Math.min(...b.weekdays) : 0;

            if (minDayA !== minDayB) {
                return minDayA - minDayB;
            }
            return a.time.localeCompare(b.time);
        });

        if (this.schedules.length === 0) {
            const emptyEl = container.createDiv({ cls: 'recurring-empty' });
            emptyEl.createSpan({ text: t('noRecurringSchedules') || '暂无周期性日程，点击上方按钮添加' });
            return;
        }

        const weekdayLabels = (t('weekdaysShort') || '一,二,三,四,五,六,日').split(',');

        this.schedules.forEach((schedule, index) => {
            const card = container.createDiv({ cls: 'recurring-card' });

            // 头部：启用开关、周几选择和删除按钮
            const cardHeader = card.createDiv({ cls: 'recurring-card-header' });

            // 左侧组：开关
            const headerLeft = cardHeader.createDiv({ cls: 'header-left' });
            const enableToggle = headerLeft.createEl('input', {
                type: 'checkbox',
                cls: 'recurring-enable-toggle'
            });
            enableToggle.checked = schedule.enabled;
            enableToggle.oninput = () => {
                schedule.enabled = enableToggle.checked;
                this.saveSchedules();
            };

            // 中间组：周几选择
            const weekdaysRow = cardHeader.createDiv({ cls: 'recurring-weekdays' });
            for (let day = 1; day <= 7; day++) {
                const dayBtn = weekdaysRow.createEl('button', {
                    cls: `weekday-btn ${schedule.weekdays.includes(day) ? 'active' : ''}`,
                    text: weekdayLabels[day - 1]
                });
                dayBtn.onclick = () => {
                    const idx = schedule.weekdays.indexOf(day);
                    if (idx >= 0) {
                        schedule.weekdays.splice(idx, 1);
                    } else {
                        schedule.weekdays.push(day);
                        schedule.weekdays.sort((a, b) => a - b);
                    }
                    dayBtn.toggleClass('active', schedule.weekdays.includes(day));
                    this.saveSchedules();
                };
            }

            // 右侧组：删除
            const deleteBtn = cardHeader.createEl('button', { cls: 'recurring-delete-btn' });
            setIcon(deleteBtn, 'trash-2');
            deleteBtn.onclick = () => {
                new ConfirmModal(
                    this.app,
                    t('deleteSchedule') || '删除日程',
                    t('confirmDeleteSchedule') || '确定要删除这个周期性日程吗？',
                    () => {
                        this.schedules.splice(index, 1);
                        this.renderScheduleList(container);
                        this.saveSchedules();
                    },
                    t('delete') || '删除'
                ).open();
            };

            // 时间和标题行
            const mainRow = card.createDiv({ cls: 'recurring-main-row' });

            const timeInput = mainRow.createEl('input', {
                type: 'time',
                cls: 'recurring-time-input',
                value: schedule.time
            });
            timeInput.oninput = () => {
                schedule.time = timeInput.value;
                this.saveSchedules();
            };

            const titleInput = mainRow.createEl('input', {
                type: 'text',
                cls: 'recurring-title-input',
                placeholder: t('scheduleTitle') || '日程标题',
                value: schedule.title
            });
            titleInput.oninput = () => {
                schedule.title = titleInput.value;
                this.saveSchedules();
            };

            // 描述输入
            const descInput = card.createEl('textarea', {
                cls: 'recurring-desc-input',
                placeholder: t('scheduleDescription') || '日程描述（可选）'
            });
            descInput.value = schedule.description;
            descInput.rows = 1; // 进一步压缩
            descInput.oninput = () => {
                schedule.description = descInput.value;
                this.saveSchedules();
            };
        });
    }

    saveSchedules() {
        this.onSave(this.schedules);
    }

    onClose() {
        // 最终兜底保存
        this.saveSchedules();
        this.contentEl.empty();
    }
}
