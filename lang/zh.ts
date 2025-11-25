export const zh: Record<string, string> = {
    // aribbon
    'openCalendar': '打开工作日志日历',

    // calendar view
    'viewTitle': '工作日志',
    'prevMonth': '上个月',
    'nextMonth': '下个月',
    'dateFormat': 'YYYY年MM月',
    'weekStatTooltip': '生成本周工作报告',
    
    // daily note
    'dailyNoteTemplate': `### 待办事项
- [ ] 

### 工作记录
- 09:00 

### 今日总结
`,

    // report modal
    'reportTitle': '周工作报告',
    'aiTitle': 'AI 生成周报',
    'copyTooltip': '将表格复制到剪贴板',
    'taskContent': '任务内容',
    'durationHours': '工时(小时)',
    'durationDays': '工时(人天)',
    'total': '合计',
    'noData': '本周没有解析到任何计时任务',
    'copySuccess': '已复制到剪贴板',

    // AI
    'aiClickToStart': '点击上方的 ✨ 图标开始生成...',
    'aiApiKeyMissing': 'AI API Key 未配置，请在设置中填写',
    'aiNoContent': '没有找到可供分析的周报内容',
    'aiLoading': 'AI 总结生成中，请稍候...',
    'aiError': 'AI 生成失败: ',
    'aiPrompt': `你是一个专业的周报助手。请根据以下一周的工作日志内容（包含每日任务记录和可能的每日总结），为我生成一份精简的周工作总结。
要求：
1. 包含“本周重点工作”、“遇到的问题与解决方案”、“下周计划建议”三个部分。
2. 语言简练、职业化。
3. 忽略琐碎的非工作内容。
4. 直接输出 Markdown 格式内容。

以下是本周的原始日志数据：
`,

    // settings
    'settingsTitle': '工作日志插件设置',
    'rootFolder': '日志根目录',
    'rootFolderDesc': '存放每日工作日志的文件夹。',
    'hoursPerDay': '每日标准工时',
    'hoursPerDayDesc': '用于计算人天数，例如 8 小时/天。',

    'aiConfigTitle': 'AI 助手配置',
    'aiConfigDesc': '配置一个兼容 OpenAI API 标准的模型服务，用于生成周报总结。',
    'apiEndpoint': 'API Endpoint',
    'apiEndpointDesc': '大语言模型服务的 API 地址，例如 https://api.openai.com/v1/chat/completions',
    'apiKey': 'API Key',
    'apiKeyDesc': '你的模型服务提供商的 API Key。',
    'modelName': '模型名称',
    'modelNameDesc': '要使用的具体模型，例如 gpt-4, gemini-2.5-flash。',
    'prompt': '系统提示词 (Prompt)',
    'promptDesc': '发送给 AI 的指令，用于指导它如何生成周报。',
    'weekdaysShort': '一,二,三,四,五,六,日',
    'monthTasksTitle': '本月未完成的任务',
};
