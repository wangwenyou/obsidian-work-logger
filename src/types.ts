import { t } from '../lang';

/**
 * 视图类型常量
 */
export const VIEW_TYPE_CALENDAR = "work-logger-calendar";

/**
 * 插件设置接口
 */
export interface CategoryDefinition {
    id: string;
    name: string;
    icon: string;
    patterns: string;
    color?: string;
}

export interface WorkLoggerSettings {
    rootFolder: string;
    hoursPerDay: number;
    llmEndpoint: string;
    llmApiKey: string;
    llmModel: string;
    llmPrompt: string;
    llmMonthPrompt: string;
    llmYearPrompt: string;
    defaultStartTime: string;
    defaultEndTime: string;
    recurringSchedules: RecurringScheduleData[];
    categories: CategoryDefinition[];
    lastAiSuggestion?: {
        content: string;
        date: string;
    };
    lastWeeklyOptimization?: string;
    mcpUrl: undefined,
    mcpHeaders: undefined,
    mcpMethod?: 'GET' | 'POST';
    mcpPrompts: Array<{
        label: string;
        prompt: string;
    }>;
    mcpModalTitle: string; // 新增字段
    mcpCache?: {
        content: string;
        lastFetched: string;
    };
}

/**
 * 周期性日程数据接口
 */
export interface RecurringScheduleData {
    id: string;
    title: string;
    time: string;
    description: string;
    weekdays: number[];
    enabled: boolean;
}

/**
 * 默认设置
 */
export const DEFAULT_SETTINGS: WorkLoggerSettings = {
    rootFolder: 'WorkLogs',
    hoursPerDay: 8,
    llmEndpoint: 'https://api.openai.com/v1',
    llmApiKey: '',
    llmModel: 'gpt-4o-mini',
    llmPrompt: '',
    llmMonthPrompt: '',
    llmYearPrompt: '',
    defaultStartTime: '09:00',
    defaultEndTime: '18:00',
    recurringSchedules: [],
    categories: [
        { id: 'meeting', name: '会议沟通', icon: 'users', patterns: '会议|meeting|讨论|沟通|sync|standup|review|评审|对齐|同步|周会|日会|晨会|例会|培训|training|workshop', color: '#6366f1' },
        { id: 'coding', name: '编码开发', icon: 'code', patterns: '编码|coding|开发|代码|debug|调试|修复|fix|bug|feature|功能|实现|implement|重构|refactor', color: '#10b981' },
        { id: 'design', name: '架构设计', icon: 'blocks', patterns: '架构|architecture|设计|design|方案|技术方案|系统设计|概要设计|详细设计|模块设计', color: '#3b82f6' },
        { id: 'reading', name: '阅读学习', icon: 'book-open', patterns: '阅读|reading|学习|learn|研究|research|文档|document|看书|教程|tutorial', color: '#f59e0b' },
        { id: 'writing', name: '写作文档', icon: 'pencil', patterns: '写作|writing|撰写|文章|blog|博客|笔记|note|记录|总结|report|报告', color: '#a855f7' },
        { id: 'testing', name: '测试验证', icon: 'check-circle', patterns: '测试|test|qa|质量|验证|verify', color: '#ef4444' },
        { id: 'break', name: '休息闲暇', icon: 'coffee', patterns: '休息|break|午餐|lunch|dinner|晚餐|吃饭|coffee|咖啡', color: '#ec4899' },
        { id: 'exercise', name: '运动健康', icon: 'heart', patterns: '运动|exercise|健身|gym|跑步|run|walk|散步', color: '#06b6d4' },
        { id: 'communication', name: '邮件通讯', icon: 'mail', patterns: '邮件|email|mail|消息|message|回复|reply|slack|钉钉|微信', color: '#8b5cf6' },
        { id: 'planning', name: '计划规划', icon: 'calendar', patterns: '计划|plan|规划|安排|schedule|todo|待办', color: '#f97316' },
        { id: 'work', name: '常规工作', icon: 'briefcase', patterns: '.*', color: '#64748b' }
    ],
    mcpUrl: undefined,
    mcpHeaders: undefined,
    mcpMethod: 'POST',
    mcpPrompts: [
        { label: '📝 总结待办', prompt: '帮我总结最近的待办事项' },
        { label: '🎯 今日重点', prompt: '分析今日工作重点' },
        { label: '⚠️ 提取风险', prompt: '提取当前任务中的潜在风险点' }
    ],
    mcpModalTitle: 'MCP 智能助理', // 默认标题
    mcpCache: undefined
};

/**
 * 时间线项目接口
 */
export interface TimelineItem {
    time: string;
    content: string;
    description?: string;
    duration?: string;
    category?: string;
    icon?: string;
}

/**
 * 日期数据接口
 */
export interface DayData {
    date: moment.Moment;
    items: TimelineItem[];
}

/**
 * 任务条目接口
 */
export interface TaskEntry {
    time: moment.Moment;
    title: string;
}

/**
 * 任务信息接口
 */
export interface TaskInfo {
    task: string;
    path: string;
}
