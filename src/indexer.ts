import { App, TFile, moment } from 'obsidian';
import type WorkLoggerPlugin from '../main';
import { parseDailyContent } from './utils';

/**
 * 索引数据结构
 * 日期 (YYYY-MM-DD) -> { 任务名: 工时 }
 */
export type WorkDataIndex = Record<string, Record<string, number>>;

export class WorkLoggerIndexer {
    private plugin: WorkLoggerPlugin;
    private app: App;
    private index: WorkDataIndex = {};
    private indexPath: string;

    constructor(plugin: WorkLoggerPlugin) {
        this.plugin = plugin;
        this.app = plugin.app;
        this.indexPath = `${this.plugin.manifest.dir}/data-index.json`;
    }

    async loadIndex() {
        if (await this.app.vault.adapter.exists(this.indexPath)) {
            try {
                const data = await this.app.vault.adapter.read(this.indexPath);
                this.index = JSON.parse(data);
            } catch (e) {
                console.error("Work Logger: Failed to load index", e);
                this.index = {};
            }
        }
    }

    async saveIndex() {
        try {
            await this.app.vault.adapter.write(this.indexPath, JSON.stringify(this.index));
        } catch (e) {
            console.error("Work Logger: Failed to save index", e);
        }
    }

    /**
     * 更新单个文件的索引
     */
    async indexFile(file: TFile) {
        if (!file.path.startsWith(this.plugin.settings.rootFolder) || !file.path.endsWith('.md')) return;
        
        const dateStr = this.getDateStrFromPath(file.path);
        if (!dateStr) return;

        const content = await this.app.vault.read(file);
        const stats: Record<string, number> = {};
        parseDailyContent(content, stats);
        
        this.index[dateStr] = stats;
        await this.saveIndex();
    }

    /**
     * 全量扫描（仅在首次或目录变更时）
     */
    async fullScan() {
        const root = this.plugin.settings.rootFolder;
        if (!(await this.app.vault.adapter.exists(root))) return;

        const { folders } = await this.app.vault.adapter.list(root);
        for (const monthFolder of folders) {
            const { files } = await this.app.vault.adapter.list(monthFolder);
            for (const filePath of files) {
                if (filePath.endsWith('.md')) {
                    const file = this.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        const dateStr = this.getDateStrFromPath(filePath);
                        if (dateStr) {
                            const content = await this.app.vault.read(file);
                            const stats: Record<string, number> = {};
                            parseDailyContent(content, stats);
                            this.index[dateStr] = stats;
                        }
                    }
                }
            }
        }
        await this.saveIndex();
    }

    /**
     * 获取指定范围内的统计数据
     */
    getStatsInRange(start: moment.Moment, end: moment.Moment): Record<string, number> {
        const totalStats: Record<string, number> = {};
        const current = start.clone();
        
        while (current.isSameOrBefore(end, 'day')) {
            const dateStr = current.format('YYYY-MM-DD');
            const dayStats = this.index[dateStr];
            if (dayStats) {
                for (const [task, hours] of Object.entries(dayStats)) {
                    totalStats[task] = (totalStats[task] || 0) + hours;
                }
            }
            current.add(1, 'day');
        }
        return totalStats;
    }

    /**
     * 快速查找包含特定任务的日期
     */
    findDatesWithTask(taskName: string): string[] {
        const dates: string[] = [];
        for (const [date, stats] of Object.entries(this.index)) {
            if (stats[taskName]) {
                dates.push(date);
            }
        }
        return dates.sort().reverse(); // 最近的日期在前
    }

    private getDateStrFromPath(path: string): string | null {
        // 路径格式: root/YYYYMM/DD.md
        const parts = path.split('/');
        const fileName = parts.pop(); // DD.md
        const monthFolder = parts.pop(); // YYYYMM
        if (!fileName || !monthFolder) return null;

        const day = fileName.replace('.md', '');
        const year = monthFolder.substring(0, 4);
        const month = monthFolder.substring(4, 6);
        return `${year}-${month}-${day.padStart(2, '0')}`;
    }
}
