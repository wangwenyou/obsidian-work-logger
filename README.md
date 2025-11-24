# Obsidian Work Logger

A minimalist, calendar-based time tracking and weekly reporting plugin for Obsidian. It allows you to log daily tasks using simple Markdown and automatically generates weekly reports. With the latest update, it now features **AI-powered weekly summaries**, helping you draft professional reports effortlessly.

---

[🇨🇳 中文说明](#-中文说明)

---

![screenshot](https://raw.githubusercontent.com/wangwenyou/obsidian-work-logger/main/images/screenshot.png)

## ✨ Features

-   **📅 Visual Calendar Interface**: A clean, Apple Calendar-style monthly view to navigate your work logs.
-   **🤖 AI-Powered Summaries**: Automatically generate a professional weekly report (Key Work, Issues, Next Steps) using a configurable AI model (compatible with OpenAI API).
-   **📝 Markdown Native**: Data is stored as simple Markdown lists. No databases, no complex metadata.
-   **⚡ Automatic Calculation**: Just log the start time of each task; the plugin calculates the duration based on the next task's start time.
-   **📊 Weekly Time Stats**: One-click generation of weekly summaries, aggregating time spent on each task.
-   **📋 Excel Friendly**: Copy report data to your clipboard with one click, formatted perfectly for Excel (Tab-separated).
-   **🌍 Multi-lingual Support**: UI adapts to your Obsidian language settings (English and Chinese supported).
-   **🎨 Elegant UI**: Features "Today" highlighting, data presence indicators (checkmarks), and a clutter-free design.

## 🚀 Usage

#### 1. Open the Calendar
Click the **ribbon icon** (Calendar with a checkmark) on the left sidebar to open the Work Logger view.

#### 2. Log Your Tasks
Click on any date in the calendar. It will create (or open) a daily note file in your specified folder (default: `Timesheets/YYYYMM/DD.md`).

**Syntax Format:** Use a bullet list with `HH:mm Task Name`.

```markdown
### Work Records
- 09:00 Daily Standup
- 09:30 Feature Development: Login API
- 12:00 Lunch Break
- 13:30 Fix Bug #404
- 18:00 End of Day
```
*How it calculates:* "Daily Standup" lasts from 09:00 to 09:30 (0.5h). The last entry (e.g., "End of Day") is required to close the time block of the previous task.

#### 3. Generate Weekly Report
Hover over the left side of any week row in the calendar. A **chart icon** 📊 will appear. Click it to see the time statistics for that week.

#### 4. Generate AI Summary
In the report modal, click the **sparkles icon** ✨ in the top right corner. The plugin will send your weekly logs to the configured AI model and display a generated summary.

#### 5. Export
In the report modal, click the **copy icon** to paste the time statistics table directly into Excel or Google Sheets.

## ⚙️ Settings

-   **Log Root Folder**: The folder where daily logs are saved (Default: `Timesheets`).
-   **Standard Hours per Day**: Used to calculate "Man-Days" in the report (Default: 8).
-   **AI Assistant Configuration**:
    -   **API Endpoint**: The API address of your LLM service (e.g., `https://api.openai.com/v1/chat/completions`).
    -   **API Key**: Your API key for the service.
    -   **Model Name**: The model to use (e.g., `gpt-4`, `gemini-2.5-flash`).
    -   **System Prompt**: The instruction template sent to the AI to guide report generation. You can customize it to fit your needs.

## 🔧 Installation

#### From Obsidian Community Plugins
1.  Go to `Settings` > `Community plugins`.
2.  Turn off `Safe mode`.
3.  Click `Browse` and search for "Work Logger".
4.  Click `Install` and then `Enable`.

#### Manual Installation
1.  Download `main.js`, `manifest.json`, and `styles.css` from the [latest Release](https://github.com/wangwenyou/obsidian-work-logger/releases).
2.  Create a folder named `work-logger` in your vault's `.obsidian/plugins/` directory.
3.  Paste the files into that folder.
4.  Reload Obsidian and enable the plugin in Settings.

---

## <h2 id="中文说明">🇨🇳 中文说明</h2>

Obsidian Work Logger 是一个极简的工时记录与周报生成插件。它能让你通过简单的 Markdown 语法记录每日任务，并自动生成周报统计。最新版本更集成了 **AI 智能摘要功能**，帮你轻松草拟专业周报。

![screenshot](https://raw.githubusercontent.com/wangwenyou/obsidian-work-logger/main/images/screenshot.png)

## ✨ 核心功能

-   **📅 精致日历视图**：类 Apple Calendar 风格的月视图，让你在日志间轻松导航。
-   **🤖 AI 智能摘要**：使用可配置的 AI 模型（兼容 OpenAI API），一键将整周的工作记录自动生成为包含“本周重点”、“问题挑战”和“下周计划”的专业报告。
-   **📝 纯文本存储**：数据以 Markdown 列表形式存储，无数据库，数据由你完全掌控。
-   **⚡ 自动时长计算**：只需记录每项任务的开始时间，插件会自动根据下一项任务的时间计算当前任务耗时。
-   **📊 周报工时统计**：一键生成周报，自动按任务标题汇总工时。
-   **📋 Excel 友好导出**：一键复制工时统计表格，完美粘贴到 Excel 或 Google Sheets 中，格式工整。
-   **🌍 多语言支持**：自动适应 Obsidian 的界面语言（已支持中文和英文）。
-   **🎨 优雅的 UI**：包含“今日”高亮、任务已记录对勾标记，界面清爽无干扰。

## 🚀 使用指南

#### 1. 打开日历
点击 Obsidian 左侧边栏的**插件图标**（带有对勾的日历）打开插件视图。

#### 2. 记录工时
点击日历上的任意日期。插件会在指定目录下创建或打开对应文件（默认路径：`Timesheets/YYYYMM/DD.md`）。

**书写格式**：使用无序列表，格式为 `- HH:mm 任务名称`。

```markdown
### 工作记录
- 09:00 晨会
- 09:30 开发登录接口
- 12:00 午休
- 13:30 修复 Bug #404
- 18:00 下班
```
*计算逻辑*："晨会" 的耗时为 09:00 到 09:30 (0.5小时)。必须包含最后一行（如“下班”）作为上一项任务的结束时间标记。

#### 3. 生成周报统计
鼠标悬停在日历某一周的最左侧，会出现一个**图表图标** 📊，点击它即可查看本周的工时统计。

#### 4. 生成 AI 摘要
在统计弹窗中，点击右上角的**闪光图标** ✨。插件会将本周的所有日志发送给配置好的 AI 模型，并展示生成的周报摘要。

#### 5. 导出数据
在统计弹窗中，点击**复制图标**，即可将工时统计表格直接粘贴到 Excel 等表格软件中。

## ⚙️ 设置选项

-   **日志根目录**：存放日报文件的根文件夹名称（默认：`Timesheets`）。
-   **每日标准工时**：用于将小时数换算为“人天”（默认：8 小时 = 1 人天）。
-   **AI 助手配置**：
    -   **API Endpoint**：大语言模型服务的 API 地址（例如 `https://api.openai.com/v1/chat/completions`）。
    -   **API Key**：你的模型服务提供商的 API Key。
    -   **模型名称**：要使用的具体模型（例如 `gpt-4`, `gemini-2.5-flash`）。
    -   **系统提示词 (Prompt)**：发送给 AI 的指令模板，用于指导它如何生成周报。你可以按需定制。

## 🔧 安装

#### 从 Obsidian 插件市场安装
1.  进入 `设置` > `第三方插件`。
2.  关闭 `安全模式`。
3.  点击 `浏览` 社区插件，搜索 "Work Logger"。
4.  点击 `安装`，然后 `启用`。

#### 手动安装
1.  从 [Releases 页面](https://github.com/wangwenyou/obsidian-work-logger/releases) 下载最新的 `main.js`, `manifest.json`, `styles.css` 文件。
2.  在你的 Obsidian 仓库中的 `.obsidian/plugins/` 目录下，创建一个名为 `work-logger` 的文件夹。
3.  将下载的三个文件粘贴进去。
4.  重启 Obsidian，在设置中启用插件。

## 🛡 License

[MIT](./LICENSE)