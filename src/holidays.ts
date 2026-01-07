import { requestUrl, moment } from 'obsidian';

/**
 * 节假日信息接口
 */
export interface HolidayInfo {
    date: string;           // YYYY-MM-DD
    name: string;           // 节日名称
    isOffDay: boolean;      // true=休息日, false=补班日
    type: 'holiday' | 'workday' | 'weekend';
}

/**
 * 节假日缓存
 */
interface HolidayCache {
    [year: number]: Map<string, HolidayInfo>;
}

const holidayCache: HolidayCache = {};
let isChineseUser: boolean | null = null;

/**
 * 检测是否为中国用户
 */
function detectChineseUser(): boolean {
    if (isChineseUser !== null) return isChineseUser;

    const lang = window.localStorage.getItem('language') || navigator.language || '';
    isChineseUser = lang.toLowerCase().startsWith('zh');
    return isChineseUser;
}

/**
 * 从 holiday-cn 获取中国节假日数据
 */
async function fetchChineseHolidays(year: number): Promise<Map<string, HolidayInfo>> {
    const cache = new Map<string, HolidayInfo>();

    try {
        // 使用 jsDelivr CDN 获取数据
        const url = `https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/${year}.json`;
        const response = await requestUrl({ url, method: 'GET' });

        if (response.status !== 200) {
            console.warn(`Work Logger: Failed to fetch holidays for ${year}, status: ${response.status}`);
            return cache;
        }

        const data = response.json;
        if (data && data.days) {
            for (const day of data.days) {
                const dateStr = day.date; // YYYY-MM-DD format
                cache.set(dateStr, {
                    date: dateStr,
                    name: day.name || '',
                    isOffDay: day.isOffDay === true,
                    type: day.isOffDay ? 'holiday' : 'workday'
                });
            }
        }
    } catch (error) {
        // 静默处理 404 错误
        console.warn(`Work Logger: Could not load holidays for ${year}`, error);
    }

    return cache;
}

/**
 * 加载指定年份的节假日数据
 */
export async function loadHolidays(year: number): Promise<Map<string, HolidayInfo>> {
    if (holidayCache[year]) {
        return holidayCache[year];
    }

    if (detectChineseUser()) {
        holidayCache[year] = await fetchChineseHolidays(year);
    } else {
        // 海外用户：暂时返回空 Map，后续可集成 date-holidays
        holidayCache[year] = new Map();
    }

    return holidayCache[year];
}

/**
 * 获取指定日期的节假日信息
 */
export async function getHolidayInfo(date: moment.Moment): Promise<HolidayInfo | null> {
    const year = date.year();
    const cache = await loadHolidays(year);
    const dateStr = date.format('YYYY-MM-DD');
    return cache.get(dateStr) || null;
}

/**
 * 预加载多个年份的节假日数据
 */
export async function preloadHolidays(years: number[]): Promise<void> {
    await Promise.all(years.map(year => loadHolidays(year)));
}

/**
 * 格式化节日名称（处理过长的名称）
 */
export function formatHolidayName(name: string, maxLength: number = 4): string {
    if (!name) return '';

    // 检查是否为中文
    const isChinese = /[\u4e00-\u9fa5]/.test(name);

    if (isChinese) {
        // 中文：保留前几个字
        if (name.length > maxLength) {
            return name.substring(0, maxLength);
        }
        return name;
    } else {
        // 英文：如果太长则使用首字母缩写
        if (name.length > maxLength + 2) {
            const words = name.split(/\s+/);
            if (words.length > 1) {
                return words.map(w => w[0]?.toUpperCase() || '').join('');
            }
            return name.substring(0, maxLength);
        }
        return name;
    }
}

/**
 * 判断是否为周末
 */
export function isWeekend(date: moment.Moment): boolean {
    const day = date.isoWeekday();
    return day === 6 || day === 7; // 周六或周日
}

/**
 * 获取日期的显示样式类型
 */
export async function getDayDisplayType(date: moment.Moment): Promise<{
    type: 'normal' | 'holiday' | 'workday' | 'weekend';
    holidayInfo: HolidayInfo | null;
}> {
    const holiday = await getHolidayInfo(date);

    if (holiday) {
        return {
            type: holiday.isOffDay ? 'holiday' : 'workday',
            holidayInfo: holiday
        };
    }

    if (isWeekend(date)) {
        return { type: 'weekend', holidayInfo: null };
    }

    return { type: 'normal', holidayInfo: null };
}
