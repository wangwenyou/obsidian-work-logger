export const en: Record<string, string> = {
    // ribbon
    'openCalendar': 'Open work logger calendar',

    // calendar view
    'viewTitle': 'Work Logger',
    'prevMonth': 'Previous month',
    'nextMonth': 'Next month',
    'dateFormat': 'MMMM YYYY',
    'weekStatTooltip': 'Generate weekly report',

    // daily note
    'dailyNoteTemplate': `### Todos
- [ ] 

### Work Records
- 09:00 

### Daily Summary
`,

    // report modal
    'reportTitle': 'Weekly Work Report',
    'aiTitle': 'Generate with AI',
    'copyTooltip': 'Copy table to clipboard',
    'taskContent': 'Task',
    'durationHours': 'Hours',
    'durationDays': 'Man-Days',
    'total': 'Total',
    'noData': 'No timed tasks were parsed for this week',
    'copySuccess': 'Copied to clipboard',

    // AI
    'aiClickToStart': 'Click the ✨ icon above to start generating...',
    'aiApiKeyMissing': 'AI API Key is not configured, please set it in the settings',
    'aiNoContent': 'No weekly report content found for analysis',
    'aiLoading': 'AI summary is generating, please wait...',
    'aiError': 'AI generation failed: ',
    'aiPrompt': `You are a professional weekly report assistant. Based on the following week's work log content (including daily task records and possible daily summaries), please generate a concise weekly work summary for me.
Requirements:
1. Include three parts: "Key Work This Week", "Problems and Solutions", and "Next Week's Plan Suggestions".
2. The language should be concise and professional.
3. Ignore trivial non-work content.
4. Output the content directly in Markdown format.

Here is the raw log data for this week:
`,

    // settings
    'settingsTitle': 'Work Logger Plugin Settings',
    'rootFolder': 'Log Root Folder',
    'rootFolderDesc': 'The folder where daily work logs are stored.',
    'hoursPerDay': 'Standard Hours per Day',
    'hoursPerDayDesc': 'Used to calculate man-days, e.g., 8 hours/day.',

    'aiConfigTitle': 'AI Assistant Configuration',
    'aiConfigDesc': 'Configure a model service compatible with the OpenAI API standard for generating weekly summaries.',
    'apiEndpoint': 'API Endpoint',
    'apiEndpointDesc': 'The API address of the large language model service, e.g., https://api.openai.com/v1/chat/completions',
    'apiKey': 'API Key',
    'apiKeyDesc': 'The API Key from your model service provider.',
    'modelName': 'Model Name',
    'modelNameDesc': 'The specific model to use, e.g., gpt-4, gemini-2.5-flash.',
    'prompt': 'System Prompt',
    'promptDesc': 'The instruction sent to the AI to guide how it generates the weekly report.',
};
