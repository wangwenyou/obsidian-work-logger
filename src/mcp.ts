import { requestUrl, Notice } from 'obsidian';
import type WorkLoggerPlugin from '../main';

/**
 * 通过自然语言调用 MCP 服务
 * @param plugin 插件实例
 * @param prompt 发送给 MCP 的自然语言指令
 * @returns MCP 返回的文本结果
 */
export async function invokeMCP(plugin: WorkLoggerPlugin, prompt: string): Promise<string> {
    const { mcpUrl, mcpHeaders, mcpMethod = 'POST' } = plugin.settings;
    if (!mcpUrl) {
        throw new Error("MCP URL is not configured.");
    }

    try {
        let headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (mcpHeaders) {
            try {
                const customHeaders = JSON.parse(mcpHeaders);
                headers = { ...headers, ...customHeaders };
            } catch (e) {
                throw new Error("Invalid MCP headers JSON.");
            }
        }

        const requestOptions: any = {
            method: mcpMethod,
            headers: headers,
        };

        if (mcpMethod === 'POST') {
            requestOptions.body = JSON.stringify({ prompt });
            requestOptions.url = mcpUrl;
        } else {
            const urlParams = new URLSearchParams({ prompt });
            requestOptions.url = `${mcpUrl}?${urlParams.toString()}`;
        }

        const response = await requestUrl(requestOptions);

        if (response.json?.result) {
            return response.json.result;
        }
        return response.text;

    } catch (error) {
        console.error("MCP Invoke Error:", error);
        throw new Error(`Failed to invoke MCP: ${error.message}`);
    }
}
