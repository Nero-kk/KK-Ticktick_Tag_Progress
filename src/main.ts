import {
  Notice,
  normalizePath,
  Plugin,
  requestUrl,
  TFile,
} from 'obsidian';
import type { ApiTransport } from './api/official-open-api-client';
import { OfficialOpenApiClient } from './api/official-open-api-client';
import { TickTickHttpError } from './api/errors';
import { addTickTickView } from './bases/projects-base-integrator';
import { aggregateTagProgress, normalizeTagKey, UNTAGGED_KEY } from './core/tag-progress-aggregator';
import { normalizeTask } from './core/normalizer';
import { clampTaskToMonth } from './core/period';
import { SnapshotStore } from './core/snapshot-store';
import { SyncService } from './core/sync-service';
import { CompletionRefreshError, TaskCompletionService, type CompletionTarget } from './core/task-completion-service';
import { ObsidianTaskNotePort } from './notes/obsidian-task-note-port';
import { TaskNoteRepository } from './notes/task-note-repository';
import { loadSettings, type TickTickTagProgressSettings } from './settings-model';
import { TickTickTagProgressSettingTab } from './settings';
import { DASHBOARD_VIEW_TYPE, GanttDashboardView } from './ui/dashboard-view';
import type { DashboardModel } from './ui/dashboard-renderer';
import { TaskCompletionModal } from './ui/task-completion-modal';

interface PluginData {
  settings?: unknown;
  snapshotState?: unknown;
}

const transport: ApiTransport = async (request) => {
  const response = await requestUrl({
    url: request.url,
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined ? {} : { body: request.body }),
    contentType: 'application/json',
    throw: false,
  });
  return { status: response.status, json: response.text.trim() ? response.json : null };
};

export default class TickTickTagProgressPlugin extends Plugin {
  declare settings: TickTickTagProgressSettings;
  private snapshotStore!: SnapshotStore;
  private api!: OfficialOpenApiClient;
  private syncService!: SyncService;
  private taskCompletion!: TaskCompletionService;
  private taskNotes!: TaskNoteRepository;
  private syncing = false;

  async onload(): Promise<void> {
    const raw = (await this.loadData()) as PluginData | null;
    this.settings = loadSettings(raw?.settings);
    this.snapshotStore = new SnapshotStore(raw?.snapshotState ?? { snapshots: {} });
    this.api = new OfficialOpenApiClient(
      () => this.app.secretStorage.getSecret(this.settings.secretName),
      transport,
    );
    this.syncService = new SyncService(this.api, this.snapshotStore);
    this.taskCompletion = new TaskCompletionService(
      {
        getTask: async (projectId, taskId) => normalizeTask(
          await this.api.getTask(projectId, taskId),
          this.projectNameFor(projectId),
        ),
        completeTask: (projectId, taskId) => this.api.completeTask(projectId, taskId),
      },
      { sync: (month) => this.syncService.sync(month) },
    );
    this.taskNotes = new TaskNoteRepository(new ObsidianTaskNotePort(this.app), this.settings.projectAliases);

    this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new GanttDashboardView(leaf, this));
    this.addRibbonIcon('chart-gantt', 'TickTick 태그 진행률', () => { void this.activateDashboard(); });
    this.addCommand({ id: 'open-dashboard', name: '태그별 진행률 대시보드 열기', callback: () => { void this.activateDashboard(); } });
    this.addCommand({ id: 'sync-current-month', name: '현재 월 수동 동기화', callback: () => { void this.syncMonth(this.currentMonth()); } });
    this.addCommand({ id: 'ensure-projects-base', name: 'Projects.base TickTick 뷰 연결', callback: () => { void this.ensureProjectsBase(); } });
    this.addSettingTab(new TickTickTagProgressSettingTab(this));
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(DASHBOARD_VIEW_TYPE);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  async savePluginData(): Promise<void> {
    await this.saveData({ settings: this.settings, snapshotState: this.snapshotStore.exportState() });
  }

  async activateDashboard(): Promise<void> {
    let leaf = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)[0];
    if (!leaf) {
      leaf = this.app.workspace.getLeaf(true);
      await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
    }
    await this.app.workspace.revealLeaf(leaf);
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE)) {
      if (leaf.view instanceof GanttDashboardView) leaf.view.render();
    }
  }

  getDashboardModel(month: string, selectedTagKey?: string): DashboardModel {
    const snapshot = this.snapshotStore.getLastGood(month);
    const lastAttempt = this.snapshotStore.getLastAttempt();
    if (!snapshot) {
      const result = lastAttempt?.selectedMonth === month ? lastAttempt.result : undefined;
      return {
        month,
        status: this.syncing ? 'syncing' : result === 'auth' ? 'auth' : result === 'contract' ? 'contract' : 'empty',
        uniqueTaskCount: 0,
        selectedTagKey,
        rows: [],
        tasks: [],
      };
    }
    const include = new Set(this.settings.includeTags.map(normalizeTagKey));
    const exclude = new Set(this.settings.excludeTags.map(normalizeTagKey));
    const rows = aggregateTagProgress(snapshot.tasks, month, { showUntagged: this.settings.showUntagged })
      .filter((row) => (row.tagKey === UNTAGGED_KEY
        ? this.settings.showUntagged
        : (include.size === 0 || include.has(row.tagKey)) && !exclude.has(row.tagKey)));
    const scheduled = snapshot.tasks.filter((task) => {
      const start = task.localStartDate ?? task.localDueDate;
      const due = task.localDueDate ?? task.localStartDate;
      return Boolean(start && due && clampTaskToMonth(start, due, month));
    });
    const failedAfterSnapshot = lastAttempt
      && lastAttempt.selectedMonth === month
      && lastAttempt.result !== 'success'
      && lastAttempt.attemptedAt > snapshot.generatedAt;
    return {
      month,
      status: this.syncing ? 'syncing' : failedAfterSnapshot ? 'stale' : 'complete',
      lastSuccessAt: snapshot.generatedAt,
      uniqueTaskCount: new Set(scheduled.map((task) => task.id)).size,
      selectedTagKey,
      rows,
      tasks: snapshot.tasks,
    };
  }

  async syncMonth(month: string): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;
    this.refreshViews();
    try {
      await this.syncService.sync(month);
      await this.savePluginData();
      new Notice(`${month} TickTick 태그 진행률 동기화 완료`);
    } catch (error) {
      await this.savePluginData();
      const message = error instanceof TickTickHttpError && error.kind === 'auth'
        ? 'TickTick 인증이 필요합니다. 플러그인 설정에서 SecretStorage 토큰을 확인하세요.'
        : 'TickTick 동기화에 실패했습니다. 마지막 성공 데이터는 유지됩니다.';
      new Notice(message, 8000);
    } finally {
      this.syncing = false;
      this.refreshViews();
    }
  }

  async testConnection(): Promise<void> {
    try {
      const projects = await this.api.getProjects();
      new Notice(`TickTick 공식 API 연결 성공 · 프로젝트 ${projects.length}개`);
    } catch (error) {
      new Notice(error instanceof TickTickHttpError && error.kind === 'auth' ? 'API 토큰을 확인하세요.' : 'TickTick 연결 확인에 실패했습니다.', 8000);
    }
  }

  async openTaskNote(month: string, taskId: string, newPane: boolean): Promise<void> {
    const snapshot = this.snapshotStore.getLastGood(month);
    const summary = snapshot?.tasks.find((task) => task.id === taskId);
    if (!snapshot || !summary) {
      new Notice('선택한 태스크가 현재 snapshot에 없습니다. 다시 동기화하세요.');
      return;
    }
    try {
      const detail = await this.api.getTask(summary.projectId, summary.id);
      const task = normalizeTask(detail, summary.projectName);
      await this.taskNotes.openOrCreate(task, {
        syncedAt: new Date().toISOString(), snapshotAt: snapshot.generatedAt, coverage: snapshot.coverage.status,
      }, newPane);
    } catch (error) {
      new Notice(error instanceof Error ? `태스크 노트를 열지 못했습니다: ${error.message}` : '태스크 노트를 열지 못했습니다.', 8000);
    }
  }

  private projectNameFor(projectId: string): string {
    for (const snapshot of this.snapshotStore.listSnapshots()) {
      const match = snapshot.tasks.find((task) => task.projectId === projectId);
      if (match) return match.projectName;
    }
    return projectId;
  }

  requestTaskCompletion(month: string, taskId: string): void {
    void this.beginTaskCompletion(month, taskId);
  }

  private async beginTaskCompletion(month: string, taskId: string): Promise<void> {
    const snapshot = this.snapshotStore.getLastGood(month);
    const task = snapshot?.tasks.find((candidate) => candidate.id === taskId);
    if (!snapshot || !task) {
      new Notice('선택한 태스크가 현재 snapshot에 없습니다. 다시 동기화하세요.');
      return;
    }
    if (task.status !== 'open') {
      new Notice('이미 완료되었거나 완료할 수 없는 태스크입니다.');
      return;
    }
    if (this.syncing) {
      new Notice('현재 동기화가 끝난 뒤 다시 시도하세요.');
      return;
    }

    // Entry gate: never complete from a stale, incomplete, or since-failed snapshot.
    if (snapshot.coverage.status !== 'complete') {
      new Notice('조회 범위가 제한적입니다. 다시 동기화한 뒤 완료 처리하세요.', 8000);
      return;
    }
    const lastAttempt = this.snapshotStore.getLastAttempt();
    if (lastAttempt && lastAttempt.selectedMonth === month && lastAttempt.result !== 'success'
      && lastAttempt.attemptedAt > snapshot.generatedAt) {
      new Notice('마지막 동기화가 실패했습니다. 다시 동기화한 뒤 완료 처리하세요.', 8000);
      return;
    }
    const ageMinutes = (Date.now() - Date.parse(snapshot.generatedAt)) / 60_000;
    if (!Number.isFinite(ageMinutes) || ageMinutes > this.settings.completionTtlMinutes) {
      new Notice(`데이터가 오래되었습니다. 다시 동기화한 뒤 완료 처리하세요.`, 8000);
      return;
    }

    // Pre-flight exact-ID live read before showing the confirmation preview.
    let preflight;
    try {
      preflight = await this.taskCompletion.preflight(task);
    } catch (error) {
      new Notice(this.completionErrorMessage(error), 8000);
      return;
    }
    if (preflight.status === 'not-found') {
      new Notice('태스크가 삭제되었거나 이동되었습니다. 다시 동기화하세요.', 8000);
      return;
    }
    if (preflight.status === 'already-completed') {
      new Notice('이미 완료된 태스크입니다. 다시 동기화하세요.');
      return;
    }

    const live = preflight.live;
    const target: CompletionTarget = { id: live.id, projectId: live.projectId, title: live.title, status: live.status };
    new TaskCompletionModal(
      this.app,
      { title: live.title, projectName: live.projectName, changed: preflight.changed },
      {
        onConfirm: async () => {
          this.syncing = true;
          this.refreshViews();
          try {
            const result = await this.taskCompletion.complete(month, target);
            if (result.status === 'unknown') {
              return { state: 'unknown', message: '완료 요청이 시간 초과됐습니다. TickTick 반영 여부가 확정되지 않았습니다.' };
            }
            await this.savePluginData();
            if (result.status === 'completed-unverified') {
              new Notice(`“${live.title}” 완료 요청은 전송했으나 반영을 확인하지 못했습니다. 동기화로 확인하세요.`, 9000);
            } else {
              new Notice(`“${live.title}”을 TickTick에서 완료 처리했습니다.`);
            }
            return { state: 'completed' };
          } catch (error) {
            if (error instanceof CompletionRefreshError) {
              await this.savePluginData();
              new Notice('TickTick 완료 처리는 성공했지만 화면 재동기화에 실패했습니다. 동기화 버튼을 다시 누르세요.', 9000);
              return { state: 'completed' };
            }
            return { state: 'error', message: this.completionErrorMessage(error) };
          } finally {
            this.syncing = false;
            this.refreshViews();
          }
        },
        onConfirmOutcome: async () => {
          this.syncing = true;
          this.refreshViews();
          try {
            const outcome = await this.taskCompletion.confirmOutcome(month, target);
            if (outcome.status === 'completed') {
              await this.savePluginData();
              new Notice(`“${live.title}”이 TickTick에서 완료되어 있었습니다.`);
              return { state: 'completed' };
            }
            if (outcome.status === 'not-found') {
              return { state: 'error', message: '태스크가 삭제되었거나 이동되었습니다. 다시 동기화하세요.' };
            }
            return { state: 'still-open', message: '아직 완료되지 않았습니다. 필요하면 다시 완료 처리를 시도하세요.' };
          } catch (error) {
            if (error instanceof CompletionRefreshError) {
              await this.savePluginData();
              new Notice('완료는 확인됐지만 화면 재동기화에 실패했습니다. 동기화 버튼을 다시 누르세요.', 9000);
              return { state: 'completed' };
            }
            return { state: 'error', message: this.completionErrorMessage(error) };
          } finally {
            this.syncing = false;
            this.refreshViews();
          }
        },
      },
    ).open();
  }

  private completionErrorMessage(error: unknown): string {
    if (error instanceof TickTickHttpError) {
      if (error.kind === 'auth') return 'TickTick 인증에 실패했습니다. API 토큰을 확인하세요.';
      if (error.kind === 'not-found') return '태스크가 삭제되었거나 이동되었습니다. 다시 동기화하세요.';
      if (error.kind === 'rate-limit') return 'TickTick 요청이 제한되었습니다. 잠시 후 다시 시도하세요.';
    }
    return 'TickTick 완료 처리에 실패했습니다. 태스크는 변경되지 않았습니다.';
  }

  async ensureProjectsBase(): Promise<void> {
    const path = normalizePath(this.settings.projectsBasePath);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Projects.base를 찾을 수 없습니다: ${path}`);
      return;
    }
    try {
      let changed = false;
      await this.app.vault.process(file, (source) => {
        const patched = addTickTickView(source);
        changed = patched !== source;
        return patched;
      });
      new Notice(changed ? 'Projects.base에 TickTick Task Notes 뷰를 추가했습니다.' : 'Projects.base 연결이 이미 준비되어 있습니다.');
    } catch (error) {
      new Notice(error instanceof Error ? `Projects.base 연결 실패: ${error.message}` : 'Projects.base 연결 실패', 8000);
    }
  }

  async openProjectsBase(tagKey?: string): Promise<void> {
    const path = normalizePath(this.settings.projectsBasePath);
    const file = this.app.vault.getFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`Projects.base를 찾을 수 없습니다: ${path}`);
      return;
    }
    await this.app.workspace.getLeaf('tab').openFile(file);
    if (tagKey) new Notice(`Bases에서 TickTick Task Notes 뷰를 선택한 뒤 ticktickTags에 “${tagKey}” 필터를 적용하세요.`, 7000);
  }
}
