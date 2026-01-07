import { moment, App } from 'obsidian';
import type { TimelineItem, TaskEntry, TaskInfo, CategoryDefinition } from './types';

/**
 * 任务分类关键词映射
 * 根据内容识别任务类别并返回对应图标
 */
export function getTaskCategory(content: string, categories?: CategoryDefinition[]): { category: string, icon: string } {
    const lowerContent = content.toLowerCase();

    if (categories && categories.length > 0) {
        for (const cat of categories) {
            try {
                const regex = new RegExp(cat.patterns, 'i');
                if (regex.test(lowerContent)) {
                    return { category: cat.id, icon: cat.icon };
                }
            } catch (e) {
                console.error(`Invalid regex for category ${cat.name}: ${cat.patterns}`);
            }
        }
    }

    // 兜底逻辑：默认工作
    return { category: 'work', icon: 'briefcase' };
}

/**
 * 从内容中解析时间线项目
 */
export function parseTimelineFromContent(content: string, categories?: CategoryDefinition[]): TimelineItem[] {
    const lines = content.split('\n');
    const timeRegex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
    const items: TimelineItem[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(timeRegex);

        if (match) {
            const time = match[1];
            let itemContent = match[2].trim();
            let description = '';

            // 尝试通过冒号拆分标题和首行描述
            const colonIndex = itemContent.search(/[:：]/);
            if (colonIndex !== -1) {
                description = itemContent.substring(colonIndex + 1).trim();
                itemContent = itemContent.substring(0, colonIndex).trim();
            }

            if (itemContent) {
                // 计算上一项的持续时间
                if (items.length > 0) {
                    const prevItem = items[items.length - 1];
                    const prevTime = moment(prevItem.time, 'HH:mm');
                    const currentTime = moment(time, 'HH:mm');
                    const diff = currentTime.diff(prevTime, 'minutes');
                    if (diff > 0) {
                        prevItem.duration = formatDuration(diff);
                    }
                }

                const { category, icon } = getTaskCategory(itemContent, categories);
                const newItem: TimelineItem = { time, content: itemContent, category, icon };
                if (description) newItem.description = description;
                items.push(newItem);

                // 如果是下班，忽略后续描述（可能是当日总结）
                const isEndOfDay = itemContent === '下班' || itemContent === '结束工作';
                if (isEndOfDay) {
                    newItem.description = undefined; // 同时也忽略冒号后的描述
                } else {
                    // 继续寻找后续行作为描述
                    let nextIdx = i + 1;
                    while (nextIdx < lines.length && !lines[nextIdx].trim().match(timeRegex)) {
                        const nextLine = lines[nextIdx].trim();
                        if (nextLine && !nextLine.startsWith('#')) { // 排除标题行
                            newItem.description = (newItem.description ? newItem.description + ' ' : '') + nextLine;
                        }
                        nextIdx++;
                    }
                    i = nextIdx - 1; // 跳过已处理的描述行
                }
            }
        }
    }
    return items;
}

/**
 * 格式化持续时间（分钟转换为可读格式）
 */
export function formatDuration(minutes: number): string {
    if (minutes < 60) {
        return `${minutes}分钟`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}小时${mins}分钟` : `${hours}小时`;
    }
}

/**
 * 解析每日内容并计算任务统计
 */
export function parseDailyContent(content: string, stats: Record<string, number>): void {
    const lines = content.split('\n');
    const regex = /^-\s*(\d{1,2}:\d{2})\s+(.*)$/;
    const entries: TaskEntry[] = [];

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            let taskTitle = match[2].trim();
            // 同样支持冒号拆分，只统计标题部分
            const colonIndex = taskTitle.search(/[:：]/);
            if (colonIndex !== -1) {
                taskTitle = taskTitle.substring(0, colonIndex).trim();
            }

            entries.push({
                time: moment(match[1], 'HH:mm'),
                title: taskTitle
            });
        }
    });

    for (let i = 0; i < entries.length - 1; i++) {
        const current = entries[i];
        const next = entries[i + 1];
        const duration = moment.duration(next.time.diff(current.time)).asHours();
        if (duration > 0 && current.title) {
            if (!stats[current.title]) stats[current.title] = 0;
            stats[current.title] += duration;
        }
    }
}

/**
 * 获取文件路径
 */
export function getFilePath(rootFolder: string, date: moment.Moment): string {
    return `${rootFolder}/${date.format('YYYYMM')}/${date.format('DD')}.md`;
}

/**
 * 扫描指定月份的任务
 */
export async function scanTasksForMonth(app: App, rootFolder: string, targetDate: moment.Moment): Promise<TaskInfo[]> {
    const tasks: TaskInfo[] = [];
    const month = targetDate.month();
    const year = targetDate.year();
    const daysInMonth = targetDate.daysInMonth();

    // 使用更宽松的正则表达式来匹配各种格式的待办事项
    const taskRegex = /-\s*\[\s\]\s*([^\n\r#]*)/g;

    for (let i = 1; i <= daysInMonth; i++) {
        const date = moment({ year, month, day: i });
        const filePath = getFilePath(rootFolder, date);

        if (await app.vault.adapter.exists(filePath)) {
            try {
                const content = await app.vault.adapter.read(filePath);
                let match;
                while ((match = taskRegex.exec(content)) !== null) {
                    const taskContent = match[1].trim();
                    // 过滤掉空的待办事项（只有空格或完全为空）
                    if (taskContent && taskContent.length > 0) {
                        tasks.push({ task: taskContent, path: filePath });
                    }
                }
            } catch (e) {
                console.error(`Work Logger: Could not read file ${filePath}`, e);
            }
        }
    }

    return tasks;
}

/**
 * 获取并缓存已存在的文件日期
 */
export async function fetchAndCacheExistingFiles(app: App, rootFolder: string, currentDate: moment.Moment): Promise<Set<string>> {
    const existingDates = new Set<string>();

    for (let i = -1; i <= 1; i++) {
        const monthToScan = currentDate.clone().add(i, 'month');
        const folderPath = `${rootFolder}/${monthToScan.format('YYYYMM')}`;

        if (await app.vault.adapter.exists(folderPath)) {
            try {
                const { files } = await app.vault.adapter.list(folderPath);
                files.forEach(filePath => {
                    const day = filePath.split('/').pop()?.split('.')[0];
                    if (day) {
                        const dateStr = `${monthToScan.format('YYYY-MM')}-${day.padStart(2, '0')}`;
                        existingDates.add(dateStr);
                    }
                });
            } catch (e) {
                console.error(`Work Logger: Could not list files in ${folderPath}`, e);
            }
        }
    }
    return existingDates;
}

/**
 * 准备周报数据
 */
export async function prepareWeekReportData(app: App, rootFolder: string, weekStart: moment.Moment): Promise<{ stats: Record<string, number>, content: string }> {
    const taskStats: Record<string, number> = {};
    let fullWeekContent = "";

    for (let i = 0; i < 7; i++) {
        const date = weekStart.clone().add(i, 'days');
        const filePath = getFilePath(rootFolder, date);

        if (await app.vault.adapter.exists(filePath)) {
            try {
                const content = await app.vault.adapter.read(filePath);
                parseDailyContent(content, taskStats);
                fullWeekContent += `\n=== ${date.format('YYYY-MM-DD')} ===\n${content}\n`;
            } catch (e) {
                console.error(`Work Logger: Could not read file ${filePath}`, e);
            }
        }
    }

    return { stats: taskStats, content: fullWeekContent };
}

/**
 * 采样最近的任务标题用于 AI 分类
 */
export async function sampleTaskTitles(app: App, rootFolder: string, limit = 100): Promise<string[]> {
    const titles = new Set<string>();
    const adapter = app.vault.adapter;
    
    if (!(await adapter.exists(rootFolder))) return [];
    
    const { folders } = await adapter.list(rootFolder);
    // 按月份文件夹倒序
    folders.sort().reverse();
    
    for (const folder of folders) {
        if (titles.size >= limit) break;
        const { files } = await adapter.list(folder);
        files.sort().reverse();
        
        for (const filePath of files) {
            if (titles.size >= limit) break;
            if (filePath.endsWith('.md')) {
                const content = await adapter.read(filePath);
                const stats: Record<string, number> = {};
                parseDailyContent(content, stats);
                Object.keys(stats).forEach(t => {
                    if (t.trim() && t.length > 1) titles.add(t.trim());
                });
            }
        }
    }
    
    return Array.from(titles).slice(0, limit);
}
