import { App, ButtonComponent, Modal } from 'obsidian';
import type { NormalizedTask } from '../api/contracts';

export class TaskCompletionModal extends Modal {
  constructor(
    app: App,
    private readonly task: NormalizedTask,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.setTitle('TickTick 완료 처리 확인');
    this.modalEl.addClass('ttgp-completion-modal');
    this.contentEl.replaceChildren();

    const intro = document.createElement('p');
    intro.className = 'ttgp-completion-intro';
    intro.textContent = '다음 태스크를 TickTick에서 완료 상태로 변경합니다.';

    const preview = document.createElement('dl');
    preview.className = 'ttgp-completion-preview';
    this.addPreviewRow(preview, '태스크', this.task.title);
    this.addPreviewRow(preview, '프로젝트', this.task.projectName);
    this.addPreviewRow(preview, '변경', '미완료 → 완료');

    const note = document.createElement('p');
    note.className = 'ttgp-completion-note';
    note.textContent = '완료 처리 후 현재 월 데이터를 다시 동기화합니다.';

    const error = document.createElement('p');
    error.className = 'ttgp-completion-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;

    const controls = document.createElement('div');
    controls.className = 'ttgp-completion-actions';
    const cancel = new ButtonComponent(controls)
      .setButtonText('취소')
      .onClick(() => this.close());
    const confirm = new ButtonComponent(controls)
      .setButtonText('TickTick에서 완료 처리')
      .setCta()
      .onClick(() => { void submit(); });

    const submit = async (): Promise<void> => {
      cancel.setDisabled(true);
      confirm.setDisabled(true).setButtonText('완료 처리 중…');
      error.hidden = true;
      try {
        await this.onConfirm();
        this.close();
      } catch (reason) {
        error.textContent = reason instanceof Error ? reason.message : '완료 처리에 실패했습니다.';
        error.hidden = false;
        cancel.setDisabled(false);
        confirm.setDisabled(false).setButtonText('다시 시도');
      }
    };

    this.contentEl.append(intro, preview, note, error, controls);
  }

  onClose(): void {
    this.contentEl.replaceChildren();
  }

  private addPreviewRow(container: HTMLDListElement, label: string, value: string): void {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    container.append(term, description);
  }
}
