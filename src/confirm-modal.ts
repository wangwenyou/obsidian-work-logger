import { App, Modal, Setting } from 'obsidian';

export class ConfirmModal extends Modal {
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel: string;

    constructor(app: App, title: string, message: string, onConfirm: () => void, confirmLabel: string = 'Confirm') {
        super(app);
        this.title = title;
        this.message = message;
        this.onConfirm = onConfirm;
        this.confirmLabel = confirmLabel;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h3', { text: this.title });
        contentEl.createDiv({ text: this.message, cls: 'confirm-modal-message' });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => this.close()))
            .addButton(btn => btn
                .setButtonText(this.confirmLabel)
                .setCta()
                .onClick(() => {
                    this.onConfirm();
                    this.close();
                }));
    }

    onClose() {
        this.contentEl.empty();
    }
}
