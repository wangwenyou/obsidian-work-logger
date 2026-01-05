export const zh_tw: Record<string, string> = {
    // aribbon
    'openCalendar': '打開工作日誌日曆',

    // calendar view
    'viewTitle': '工作日誌',
    'yearSummaryTitle': '{{year}} 年度工作總結',
    'yearSummaryTooltip': '生成年度總結報告',
    'prevMonth': '上個月',
    'nextMonth': '下個月',
    'dateFormat': 'YYYY年MM月',
    'weekStatTooltip': '生成本週工作報告',
    'today': '今天',
    'dateDayFormat': 'DD日',
    
    // daily note
    'dailyNoteTemplate': `### 待辦事項
- [ ] 

### 工作記錄
- {{startTime}} 
- {{endTime}} 下班

### 今日總結
`,

    // report modal
    'reportTitle': '工作數據看板',
    'totalHours': '總工時',
    'periodTotal': '本階段累計',
    'distributionTitle': '工時合併彙總',
    'copyStats': '複製彙總數據',
    'aiReportGen': 'AI 報告生成器',
    'aiCustomTitle': '自定義',
    'aiCustomPrompt': '請根據日誌進行深度分析... 例如：我今年請了幾次假，一共多少天？我參與了多少次方案評審？',
    'startGenerate': '開始生成',
    'generatedDraft': 'AI 生成草稿',
    'copyReport': '複製報告',
    'lastSync': '最後同步',
    'aiApiKeyMissing': 'AI API Key 未配置，請在設置中填寫',
    'aiNoContent': '沒有找到可供分析的週報內容',
    'aiMonthPrompt': `你是一個專業的管理顧問。請根據以下一個月的工作日誌，總結該月的核心產出、時間分配比例以及工作趨勢，並給出改進建議。
要求：
1. 語言專業、幹練。
2. 直接輸出 Markdown 格式。
以下是月度日誌數據：
`,
    'aiYearNoContent': '沒有找到該年度的工作記錄',
    'aiLoading': 'AI 總結生成中，請稍候...',
    'aiError': 'AI 生成失敗: ',
    'aiPrompt': `你是一個專業的週報助手。請根據以下一週的工作日誌內容（包含每日任務記錄和可能的每日總結），為我生成一份精簡的週工作總結。
要求：
1. 包含「本週重點工作」、「遇到的問題與解決方案」、「下週計劃建議」三個部分。
2. 語言簡練、職業化。
3. 忽略瑣碎的非工作內容。
4. 直接輸出 Markdown 格式內容。

以下是本週的原始日誌數據：
`,
    'aiYearPrompt': `你現在將扮演三個核心專家角色：資深技術架構師、數據分析專家與 OKR 管理專家。

任務：請以這三個專家的專業視角，對我提供的 {{year}} 年度工作日誌（見下文）進行深度分析與處理，為我生成一份具備高度專業性、量化指標明確且符合 OKR 規範的年終總結報告。

處理流程：

 1. 聚类与量化（數據挖掘）：
     * 將我碎片化的工作內容聚類為 4-5 個核心戰略領域（例如：核心架構演進、業務交付支持、系統穩定性治理）。
     * 從日誌中提取關鍵量化數據：主導/參與方案評審次數、支持的項目/客戶名單、修復的重大 Bug 數量、組織的培訓/分享場次、調研的新技術棧數量。

 2. OKR 格式化生成（結果輸出）：
     * 針對每個聚類領域，生成對應的 Objective (目標) 與 Key Results (關鍵結果)。
     * Objective：定性，描述核心價值，使用引領性詞彙（如「驅動...落地」、「主導...演進」）。
     * Key Results：定量，必須包含數值變化（從 X 到 Y）或具體的產出物數量（完成 Z 個模組設計），強調「結果」而非「過程」。

 3. 影响力与技术成长评价：
     * 總結我在技術廣度（如：RAG、Agentic 架構）上的探索深度。
     * 總結我在團隊影響力上的貢獻（跨組協作、分享、培訓轉化）。

輸出要求：
 * 使用 Markdown 格式。
 * 語言風格：專業、幹練、結果導向，避免「負責」、「參與」等虛詞，多用「實現」、「主導」、「優化」、「交付」等動詞。
 * 聚類時請注意： 如果某項工作持續時間長，請作為重點 KR 詳細描述。

以下是年度日誌數據：
`,

    // settings
    'settingsTitle': '工作日誌插件設置',
    'rootFolder': '日誌根目錄',
    'rootFolderDesc': '存放每日工作日誌的資料夾。',
    'hoursPerDay': '每日標準工時',
    'hoursPerDayDesc': '用於計算人天數，例如 8 小時/天。',

    'aiConfigTitle': 'AI 助手配置',
    'aiConfigDesc': '配置一個兼容 OpenAI API 標準的模型服務，用於生成週報總結。',
    'apiEndpoint': 'API Endpoint',
    'apiEndpointDesc': '大語言模型服務的 API 地址，例如 https://api.openai.com/v1/chat/completions',
    'apiKey': 'API Key',
    'apiKeyDesc': '你的模型服務提供商的 API Key。',
    'modelName': '模型名稱',
    'modelNameDesc': '要使用的具體模型，例如 gpt-4, gemini-2.5-flash。',
    'prompt': '系統提示詞 (Prompt)',
    'promptDesc': '發送給 AI 的指令，用於指導它如何生成週報。',
    'weekLabel': '第{{n}}週',
    'weekReport': '週報',
    'monthReport': '月報',
    'yearReport': '年報',
    'weekdaysLong': '週一,週二,週三,週四,週五,週六,週日',
    'weekdaysShort': '一,二,三,四,五,六,日',
    'noDayData': '暫無記錄',
    'monthTasksTitle': '本月待辦',
    'noIncompleteTasks': '本月沒有未完成的任務！',
    'timelineTitle': '時間線',
    'timelineEmpty': '請打開工作日誌文件查看時間線',
    'defaultStartTime': '預設開始時間',
    'defaultStartTimeDesc': '創建新日報時，自動插入的預設開始时间。',
    'defaultEndTime': '預設結束時間',
    'defaultEndTimeDesc': '創建新日報時，自動插入的預設結束时间。',
    'insertTimedListItem': '插入帶時間的新清單項',
};
