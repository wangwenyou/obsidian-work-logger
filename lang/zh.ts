export const zh: Record<string, string> = {
    // aribbon
    'openCalendar': '打开工作日志日历',

    // calendar view
    'viewTitle': '工作日志',
    'yearSummaryTitle': '{{year}} 年度工作总结',
    'yearSummaryTooltip': '生成年度总结报告',
    'prevMonth': '上个月',
    'nextMonth': '下个月',
    'dateFormat': 'YYYY年MM月',
    'weekStatTooltip': '生成本周工作报告',
    'today': '今天',
    'dateDayFormat': 'DD日',

    // daily note
    'dailyNoteTemplate': `### 待办事项
- [ ] 

### 工作记录
- {{startTime}} 
- {{endTime}} 下班

### 今日总结
`,

    // report modal
    'reportTitle': '工作数据看板',
    'totalHours': '总工时',
    'periodTotal': '本阶段累计',
    'distributionTitle': '工时合并汇总',
    'copyStats': '复制汇总数据',
    'aiReportGen': 'AI 报告生成器',
    'aiCustomTitle': '自定义',
    'aiCustomPrompt': '请根据日志进行深度分析... 例如：我今年请了几次假，一共多少天？我参与了多少次方案评审？',
    'startGenerate': '开始生成',
    'generatedDraft': 'AI 生成草稿',
    'copyReport': '复制报告',
    'lastSync': '最后同步',
    'aiApiKeyMissing': 'AI API Key 未配置，请在设置中填写',
    'aiNoContent': '没有找到可供分析的周报内容',
    'aiMonthPrompt': `你是一个专业的管理顾问。请根据以下一个月的工作日志，总结该月的核心产出、时间分配比例以及工作趋势，并给出改进建议。
要求：
1. 语言专业、干练。
2. 直接输出 Markdown 格式。
以下是月度日志数据：
`,
    'aiYearNoContent': '没有找到该年度的工作记录',
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
    'aiYearPrompt': `你现在将扮演三个核心专家角色：资深技术架构师、数据分析专家与 OKR 管理专家。

任务：请以这三个专家的专业视角，对我提供的 {{year}} 年度工作日志（见下文）进行深度分析与处理，为我生成一份具备高度专业性、量化指标明确且符合 OKR 规范的年终总结报告。

处理流程：

 1. 聚类与量化（数据挖掘）：
     * 将我碎片化的工作内容聚类为 4-5 个核心战略领域（例如：核心架构演进、业务交付支持、系统稳定性治理）。
     * 从日志中提取关键量化数据：主导/参与方案评审次数、支持的项目/客户名单、修复的重大 Bug 数量、组织的培训/分享场次、调研的新技术栈数量。

 2. OKR 格式化生成（结果输出）：
     * 针对每个聚类领域，生成对应的 Objective (目标) 与 Key Results (关键结果)。
     * Objective：定性，描述核心价值，使用引领性词汇（如“驱动...落地”、“主导...演进”）。
     * Key Results：定量，必须包含数值变化（从 X 到 Y）或具体的产出物数量（完成 Z 个模块设计），强调“结果”而非“过程”。

 3. 影响力与技术成长评价：
     * 总结我在技术广度（如：RAG、Agentic 架构）上的探索深度。
     * 总结我在团队影响力上的贡献（跨组协作、分享、培训转化）。

输出要求：
 * 使用 Markdown 格式。
 * 语言风格：专业、干练、结果导向，避免“负责”、“参与”等虚词，多用“实现”、“主导”、“优化”、“交付”等动词。
 * 聚类时请注意： 如果某项工作持续时间长，请作为重点 KR 详细描述。

以下是年度日志数据：
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
    'weekLabel': '第{{n}}周',
    'weekReport': '周报',
    'monthReport': '月报',
    'yearReport': '年报',
    'weekdaysLong': '周一,周二,周三,周四,周五,周六,周日',
    'weekdaysShort': '一,二,三,四,五,六,日',
    'noDayData': '暂无记录',
    'monthTasksTitle': '本月待办',
    'noIncompleteTasks': '本月没有未完成的任务！',
    'timelineTitle': '时间线',
    'timelineEmpty': '请打开工作日志文件查看时间线',
    'defaultStartTime': '默认开始时间',
    'defaultStartTimeDesc': '创建新日报时，自动插入的默认开始时间。',
    'defaultEndTime': '默认结束时间',
    'defaultEndTimeDesc': '创建新日报时，自动插入的默认结束时间。',
    'insertTimedListItem': '插入带时间的新清单项',

    // custom report
    'customReportTitle': '选择日期范围',
    'startDate': '开始日期 (YYYY-MM-DD)',
    'endDate': '结束日期 (YYYY-MM-DD)',
    'invalidDate': '日期格式无效',
    'generate': '生成报告',
    'migrateTasks': '迁移上月未完成任务',
    'migratedCount': '已迁移 {{n}} 个任务到今天',
    'noPrevTasks': '上个月没有未完成的任务',

    // date shortcuts
    'thisWeek': '本周',
    'lastWeek': '上周',
    'thisMonth': '本月',
    'last7Days': '近7天',

    // recurring schedules
    'recurringSchedules': '周期性日程',
    'addSchedule': '添加日程',
    'noRecurringSchedules': '暂无周期性日程，点击上方按钮添加',
    'scheduleTitle': '日程标题',
    'scheduleDescription': '日程描述（可选）',
    'deleteSchedule': '删除日程',
    'confirmDeleteSchedule': '确定要删除这个周期性日程吗？',
    'delete': '删除',

    // navigation
    'goToToday': '回到今天',

    // clipboard
    'taskContent': '任务内容',
    'durationHours': '时长(小时)',
    'durationDays': '时长(人天)',
    'total': '合计',
    'copySuccess': '已复制到剪贴板',
    'aiMonthNoContent': '没有找到该月份的工作记录',
    'moreTasks': '还有 {{count}} 项任务...',
    'noTasks': '该分类下暂无任务',
    'jumpToFile': '点击跳转到源文件',
    'taskFileNotFound': '未找到该任务对应的源文件',

    // categories
    'cat_meeting': '会议沟通',
    'cat_coding': '编码开发',
    'cat_design': '架构设计',
    'cat_reading': '阅读学习',
    'cat_writing': '文档撰写',
    'cat_testing': '测试验证',
    'cat_break': '休息闲暇',
    'cat_exercise': '运动健身',
    'cat_communication': '邮件通讯',
    'cat_planning': '计划规划',
    'cat_work': '常规工作',

    // settings - categories
    'categoryConfigTitle': '分类体系管理',
    'categoryConfigDesc': '自定义任务分类及其识别规则（正则表达式）。启用后，看板和时间线将按此体系进行统计。',
    'aiGenCategories': 'AI 自动生成分类',
    'aiGenCategoriesDesc': '基于你已有的工作日志内容，让 AI 自动分析并归纳出一套适合你的分类体系。',
    'genBtn': '立即生成',
    'generating': '分析中...',
    'genSuccess': '分类体系已更新',
    'genFailed': '生成失败：',
    'catName': '分类名称',
    'catIcon': '图标 (Lucide)',
    'catColor': '颜色',
    'catPatterns': '匹配规则 (Regex)',
    'addCategory': '添加分类',
    'restoreDefaults': '恢复默认分类',
    'restoreSuccess': '分类体系已恢复至默认状态',
};
