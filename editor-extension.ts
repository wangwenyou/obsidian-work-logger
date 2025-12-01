import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { EditorSelection } from '@codemirror/state';
import { moment } from 'obsidian';
import WorkLoggerPlugin from './main';

// 这是一个工厂函数，用于创建和管理编辑器扩展
export function createTimeInserterExtension(plugin: WorkLoggerPlugin) {
    return ViewPlugin.fromClass(class {
        view: EditorView;

        constructor(view: EditorView) {
            this.view = view;
        }

        update(update: ViewUpdate) {
            // 只有当设置启用，并且文档发生改变时才执行
            if (!plugin.settings.autoAddTimeOnEnter || !update.docChanged) {
                return;
            }

            // --- 新增的守卫检查 ---
            const activeFile = plugin.app.workspace.getActiveFile();
            if (!activeFile || !activeFile.path.startsWith(plugin.settings.rootFolder)) {
                return; // 如果不是工作日志文件，则不执行任何操作
            }
            // --- 守卫检查结束 ---

            for (const tr of update.transactions) {
                // 检查是否是“插入换行符”的操作 (即按下了 Enter 键)
                if (tr.isUserEvent('input.type.newline') || tr.isUserEvent('input.newline')) {
                    // 获取事务发生时的光标位置
                    const selection = tr.startState.selection.main;
                    // 如果光标在文档末尾或者没有选择内容
                    if (selection.empty) {
                        // 获取光标所在行（新行的上一行）的信息
                        const line = tr.startState.doc.lineAt(selection.head);
                        // 检查上一行是否是一个列表项（- 开头）
                        // 并且确保新行是空的
                        if (line.text.trimStart().startsWith('- ') && tr.newDoc.lineAt(selection.head).text.length === 0) {
                            const timeStr = moment().format("HH:mm");
                            const newLineText = `- ${timeStr} `;

                            // 派发一个新的事务来插入时间戳
                            // 确保插入位置在新行开始处
                            this.view.dispatch({
                                changes: {
                                    from: selection.head, // 插入到新行的开始位置
                                    to: selection.head,
                                    insert: newLineText
                                },
                                // 调整光标到时间戳之后
                                selection: EditorSelection.cursor(selection.head + newLineText.length),
                                sequential: true // 确保这个事务在之前的换行事务之后执行
                            });
                            return; // 处理完这个事务，不再检查其他
                        }
                    }
                }
            }
        }
    });
}
