import { moment } from "obsidian";
import { en } from "./en";
import { zh } from "./zh";
import { zh_tw } from "./zh-tw";

const translations: Record<string, Record<string, string>> = {
    en,
    zh,
    'zh-tw': zh_tw,
    'zh-hk': zh_tw,
};

// 获取 Obsidian当前的语言设置
const lang = moment.locale();

// 根据语言设置选择对应的翻译，如果找不到则默认使用英文
const t = (str: string): string => {
	const locale = lang.toLowerCase();
    for (const key in translations) {
        if (locale.startsWith(key)) {
            return translations[key][str] || en[str] || str;
        }
    }
    return en[str] || str;
};

export { t };
