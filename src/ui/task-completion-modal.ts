import { App, ButtonComponent, Modal } from 'obsidian';

export interface CompletionModalTask {
  title: string;
  projectName: string;
  changed: boolean;
}

export type ConfirmActionResult =
  | { state: 'completed' }
  | { state: 'unknown'; message: string }
  | { state: 'error'; message: string };

export type OutcomeActionResult =
  | { state: 'completed' }
  | { state: 'still-open'; message: string }
  | { state: 'error'; message: string };

export interface CompletionModalHandlers {
  /** Performs the completion POST (no auto-retry) plus post-write verification. */
  onConfirm: () => Promise<ConfirmActionResult>;
  /** Exact-read confirmation used after an unknown (timed-out) completion. */
  onConfirmOutcome: () => Promise<OutcomeActionResult>;
}

export class TaskCompletionModal extends Modal {
  private error!: HTMLParagraphElement;
  private note!: HTMLParagraphElement;
  private controls!: HTMLDivElement;

  constructor(
    app: App,
    private readonly task: CompletionModalTask,
    private readonly handlers: CompletionModalHandlers,
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

    if (this.task.changed) {
      const changed = document.createElement('p');
      changed.className = 'ttgp-completion-changed';
      changed.setAttribute('role', 'alert');
      changed.textContent = '이 태스크의 제목 또는 프로젝트가 마지막 동기화 이후 바뀌었습니다. 위 최신 값을 확인하고 진행하세요.';
      this.contentEl.append(changed);
    }

    this.note = document.createElement('p');
    this.note.className = 'ttgp-completion-note';
    this.note.textContent = '완료 처리 직전과 직후에 TickTick 원본 상태를 다시 확인합니다.';

    this.error = document.createElement('p');
    this.error.className = 'ttgp-completion-error';
    this.error.setAttribute('role', 'alert');
    this.error.hidden = true;

    this.controls = document.createElement('div');
    this.controls.className = 'ttgp-completion-actions';

    this.contentEl.append(intro, preview, this.note, this.error, this.controls);
    this.renderConfirmControls();
  }

  onClose(): void {
    this.contentEl.replaceChildren();
  }

  private renderConfirmControls(): void {
    this.controls.replaceChildren();
    const cancel = new ButtonComponent(this.controls).setButtonText('취소').onClick(() => this.close());
    const confirm = new ButtonComponent(this.controls)
      .setButtonText('TickTick에서 완료 처리')
      .setCta()
      .onClick(() => { void run(); });

    const run = async (): Promise<void> => {
      cancel.setDisabled(true);
      confirm.setDisabled(true).setButtonText('완료 처리 중…');
      this.error.hidden = true;
      let result: ConfirmActionResult;
      try {
        result = await this.handlers.onConfirm();
      } catch (reason) {
        this.showError(reason instanceof Error ? reason.message : '완료 처리에 실패했습니다.');
        cancel.setDisabled(false);
        confirm.setDisabled(false).setButtonText('다시 시도');
        return;
      }
      if (result.state === 'completed') { this.close(); return; }
      if (result.state === 'unknown') { this.renderUnknownState(result.message); return; }
      this.showError(result.message);
      cancel.setDisabled(false);
      confirm.setDisabled(false).setButtonText('다시 시도');
    };
  }

  private renderUnknownState(message: string): void {
    this.note.textContent = '자동 재시도를 하지 않습니다. TickTick 반영 여부를 확인한 뒤에만 다시 시도하세요.';
    this.showError(message);
    this.controls.replaceChildren();
    new ButtonComponent(this.controls).setButtonText('닫기').onClick(() => this.close());
    const check = new ButtonComponent(this.controls)
      .setButtonText('상태 확인')
      .setCta()
      .onClick(() => { void run(); });

    const run = async (): Promise<void> => {
      check.setDisabled(true).setButtonText('확인 중…');
      let result: OutcomeActionResult;
      try {
        result = await this.handlers.onConfirmOutcome();
      } catch (reason) {
        this.showError(reason instanceof Error ? reason.message : '상태 확인에 실패했습니다.');
        check.setDisabled(false).setButtonText('상태 확인');
        return;
      }
      if (result.state === 'completed') { this.close(); return; }
      if (result.state === 'still-open') {
        this.note.textContent = result.message;
        this.error.hidden = true;
        this.renderConfirmControls();
        return;
      }
      this.showError(result.message);
      check.setDisabled(false).setButtonText('상태 확인');
    };
  }

  private showError(message: string): void {
    this.error.textContent = message;
    this.error.hidden = false;
  }

  private addPreviewRow(container: HTMLDListElement, label: string, value: string): void {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    container.append(term, description);
  }
}
