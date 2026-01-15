export const en: Record<string, string> = {
    // ribbon
    'openCalendar': 'Open work logger calendar',

    // calendar view
    'viewTitle': 'Work logger',
    'yearSummaryTitle': '{{year}} Year-End Summary',
    'yearSummaryTooltip': 'Generate year-end summary report',
    'prevMonth': 'Previous month',
    'nextMonth': 'Next month',
    'dateFormat': 'MMMM YYYY',
    'weekStatTooltip': 'Generate weekly report',
    'today': 'Today',
    'dateDayFormat': 'DD',

    // daily note
    'dailyNoteTemplate': `### Todos
- [ ] 

### Work Records
- {{startTime}} 
- {{endTime}} Off-duty

### Daily Summary
`,

    'reportTitle': 'Work Dashboard',
    'totalHours': 'Total Hours',
    'periodTotal': 'Period Total',
    'distributionTitle': 'Time Distribution',
    'copyStats': 'Copy Statistics',
    'aiReportGen': 'AI Report Generator',
    'aiCustomTitle': 'Custom',
    'aiCustomPrompt': 'Deep analysis based on logs... Examples: How many leaves did I take this year? How many design reviews did I attend?',
    'startGenerate': 'Start Generate',
    'generatedDraft': 'AI Generated Draft',
    'copyReport': 'Copy Report',
    'lastSync': 'Last Sync',
    'aiApiKeyMissing': 'AI API Key is not configured, please set it in the settings',
    'aiNoContent': 'No weekly report content found for analysis',
    'aiMonthPrompt': `You are a professional management consultant. Based on the following month's logs, summarize key outputs, time distribution, and work trends, then provide improvement suggestions.
Requirements:
1. Professional and concise.
2. Output in Markdown format.
Here is the monthly log data:
`,
    'aiYearNoContent': 'No work records found for this year.',
    'aiLoading': 'AI summary is generating, please wait...',
    'aiError': 'AI generation failed: ',
    'aiPrompt': `You are a professional weekly report assistant. Based on the following week's work log content (including daily task records and possible daily summaries), please generate a concise weekly work summary for me.
Requirements:
1. Include three parts: "Key work this week", "Problems and solutions", and "Next week's plan suggestions".
2. The language should be concise and professional.
3. Ignore trivial non-work content.
4. Output the content directly in Markdown format.

Here is the raw log data for this week:
`,
    'aiYearPrompt': `Role: Senior Technical Architect, Data Analysis Expert, and OKR Management Expert.

Task: Based on the provided {{year}} annual work logs (see below), conduct a deep analysis and generate a professional, quantified year-end summary report following OKR standards.

Process:

 1. Clustering & Quantization (Data Mining):
     * Cluster fragmented work into 4-5 core strategic areas (e.g., Core Architecture Evolution, Business Delivery, System Stability).
     * Extract key quantitative data: number of design reviews, projects/clients supported, major bugs fixed, training sessions organized, new technologies researched.

 2. OKR Formatting (Output):
     * Generate corresponding Objectives and Key Results for each cluster.
     * Objective: Qualitative, describing core value, using leading verbs (e.g., "Driving...", "Leading...").
     * Key Results: Quantitative, must include numerical changes (from X to Y) or specific output counts, emphasizing results over process.

 3. Impact & Growth Evaluation:
     * Summarize technical depth (e.g., RAG, Agentic architecture).
     * Summarize team influence (cross-team collaboration, sharing, training).

Output Requirements:
 * Markdown format.
 * Language style: Professional, concise, result-oriented. Use action verbs like "Achieved", "Led", "Optimized", "Delivered".
 * Note: If a specific project took a significant amount of time, describe it as a major KR.

Annual Log Data:
`,

    // settings
    'settingsTitle': 'Work logger plugin settings',
    'rootFolder': 'Log root folder',
    'rootFolderDesc': 'The folder where daily work logs are stored.',
    'hoursPerDay': 'Standard hours per day',
    'hoursPerDayDesc': 'Used to calculate man-days, e.g., 8 hours/day.',
    'defaultStartTime': 'Default start time',
    'defaultStartTimeDesc': 'The default start time to be inserted into a new daily note.',
    'defaultEndTime': 'Default end time',
    'defaultEndTimeDesc': 'The default end time to be inserted into a new daily note.',

    'aiConfigTitle': 'AI assistant configuration',
    'aiConfigDesc': 'Configure a model service compatible with the OpenAI API standard for generating weekly summaries.',
    'apiEndpoint': 'API endpoint',
    'apiEndpointDesc': 'The API address of the large language model service, e.g., https://api.openai.com/v1/chat/completions',
    'apiKey': 'API key',
    'apiKeyDesc': 'The API Key from your model service provider.',
    'modelName': 'Model name',
    'modelNameDesc': 'The specific model to use, e.g., gpt-4, gemini-2.5-flash.',
    'prompt': 'System prompt',
    'promptDesc': 'The instruction sent to the AI to guide how it generates the weekly report.',
    'weekLabel': 'Week {{n}}',
    'weekReport': 'Weekly',
    'monthReport': 'Monthly',
    'yearReport': 'Annual',
    'weekdaysLong': 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
    'weekdaysShort': 'Mon,Tue,Wed,Thu,Fri,Sat,Sun',
    'noDayData': 'No records',
    'monthTasksTitle': 'Todos this month',
    'noIncompleteTasks': 'No incomplete tasks this month!',
    'timelineTitle': 'Timeline',
    'timelineEmpty': 'Open a work log file to view timeline',
    'insertTimedListItem': 'Insert new list item with time',

    // custom report
    'customReportTitle': 'Select Date Range',
    'startDate': 'Start Date (YYYY-MM-DD)',
    'endDate': 'End Date (YYYY-MM-DD)',
    'invalidDate': 'Invalid date format',
    'generate': 'Generate Report',
    'migrateTasks': 'Migrate last month tasks',
    'migratedCount': 'Migrated {{n}} tasks to today',
    'noPrevTasks': 'No incomplete tasks from last month',

    // date shortcuts
    'thisWeek': 'This Week',
    'lastWeek': 'Last Week',
    'thisMonth': 'This Month',
    'last7Days': 'Last 7 Days',

    // recurring schedules
    'recurringSchedules': 'Recurring Schedules',
    'addSchedule': 'Add Schedule',
    'noRecurringSchedules': 'No recurring schedules. Click above to add.',
    'scheduleTitle': 'Schedule Title',
    'scheduleDescription': 'Description (optional)',
    'deleteSchedule': 'Delete Schedule',
    'confirmDeleteSchedule': 'Are you sure you want to delete this recurring schedule?',
    'delete': 'Delete',

    // navigation
    'goToToday': 'Go to Today',

    // clipboard
    'taskContent': 'Task',
    'durationHours': 'Hours',
    'durationDays': 'Days',
    'total': 'Total',
    'copySuccess': 'Copied to clipboard',
    'aiMonthNoContent': 'No work records found for this month',
    'moreTasks': 'and {{count}} more...',
    'noTasks': 'No tasks in this category',
    'jumpToFile': 'Click to jump to source file',
    'taskFileNotFound': 'Could not find the source file for this task',

    // categories
    'cat_meeting': 'Meetings',
    'cat_coding': 'Coding',
    'cat_design': 'Design',
    'cat_reading': 'Reading/Learning',
    'cat_writing': 'Writing',
    'cat_testing': 'Testing',
    'cat_break': 'Breaks',
    'cat_exercise': 'Exercise',
    'cat_communication': 'Communication',
    'cat_planning': 'Planning',
    'cat_work': 'Work',

    // settings - categories
    'categoryConfigTitle': 'Category Management',
    'categoryConfigDesc': 'Customize task categories and their recognition rules (regex). Once enabled, the dashboard and timeline will use this system.',
    'aiGenCategories': 'AI Auto-generate Categories',
    'aiGenCategoriesDesc': 'Let AI analyze your existing work logs and summarize a classification system that suits you.',
    'genBtn': 'Generate Now',
    'generating': 'Analyzing...',
    'genSuccess': 'Category system updated',
    'genFailed': 'Generation failed: ',
    'catName': 'Category Name',
    'catIcon': 'Icon (Lucide)',
    'catColor': 'Color',
    'catPatterns': 'Match Rules (Regex)',
    'addCategory': 'Add Category',
    'restoreDefaults': 'Restore Default Categories',
    'restoreSuccess': 'Categories restored to default',

    // maintenance
    'maintenanceTitle': 'Maintenance',
    'rebuildIndex': 'Rebuild Data Index',
    'rebuildIndexDesc': 'Full scan to refresh trend data.',
    'rebuildNow': 'Rebuild Now',
    'rebuilding': 'Scanning...',
    'rebuildSuccess': 'Index rebuilt successfully',
};
