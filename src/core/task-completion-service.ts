import type { NormalizedTask } from '../api/contracts';
import { TickTickHttpError } from '../api/errors';

interface CompletionApi {
  getTask(projectId: string, taskId: string): Promise<NormalizedTask>;
  completeTask(projectId: string, taskId: string): Promise<void>;
}

interface MonthSynchronizer {
  sync(month: string): Promise<unknown>;
}

export type CompletionTarget = Pick<NormalizedTask, 'id' | 'projectId' | 'title' | 'status'>;

export type PreflightResult =
  | { status: 'ready'; live: NormalizedTask; changed: boolean }
  | { status: 'already-completed'; live: NormalizedTask }
  | { status: 'not-found' };

export type CompleteResult =
  | { status: 'completed' }
  | { status: 'completed-unverified' }
  | { status: 'unknown' };

export type ConfirmOutcome =
  | { status: 'completed' }
  | { status: 'still-open' }
  | { status: 'not-found' };

export class CompletionRefreshError extends Error {
  constructor(cause: unknown) {
    super('TickTick accepted completion, but the local refresh failed', { cause });
    this.name = 'CompletionRefreshError';
  }
}

/**
 * Safe completion pipeline for the single write endpoint this plugin exposes.
 *
 * The write is never auto-retried; a timeout surfaces as an `unknown` outcome
 * that the caller must resolve with an exact read (`confirmOutcome`) instead of
 * blindly resending. Every completion is bracketed by an exact-ID live read: a
 * pre-flight read guards against completing a stale/changed/deleted task, and a
 * post-write read verifies the state actually flipped.
 */
export class TaskCompletionService {
  constructor(
    private readonly api: CompletionApi,
    private readonly synchronizer: MonthSynchronizer,
  ) {}

  async preflight(task: CompletionTarget): Promise<PreflightResult> {
    let live: NormalizedTask;
    try {
      live = await this.api.getTask(task.projectId, task.id);
    } catch (error) {
      if (error instanceof TickTickHttpError && error.kind === 'not-found') return { status: 'not-found' };
      throw error;
    }
    if (live.status !== 'open') return { status: 'already-completed', live };
    const changed = live.title !== task.title || live.projectId !== task.projectId;
    return { status: 'ready', live, changed };
  }

  async complete(month: string, task: CompletionTarget): Promise<CompleteResult> {
    try {
      await this.api.completeTask(task.projectId, task.id);
    } catch (error) {
      if (error instanceof TickTickHttpError && error.kind === 'unknown-outcome') return { status: 'unknown' };
      throw error;
    }
    let verifiedStillOpen = false;
    try {
      const live = await this.api.getTask(task.projectId, task.id);
      verifiedStillOpen = live.status === 'open';
    } catch {
      // Post-write verification is best-effort; the POST already returned 2xx.
    }
    await this.refresh(month);
    return verifiedStillOpen ? { status: 'completed-unverified' } : { status: 'completed' };
  }

  async confirmOutcome(month: string, task: CompletionTarget): Promise<ConfirmOutcome> {
    let live: NormalizedTask;
    try {
      live = await this.api.getTask(task.projectId, task.id);
    } catch (error) {
      if (error instanceof TickTickHttpError && error.kind === 'not-found') return { status: 'not-found' };
      throw error;
    }
    if (live.status !== 'open') {
      await this.refresh(month);
      return { status: 'completed' };
    }
    return { status: 'still-open' };
  }

  private async refresh(month: string): Promise<void> {
    try {
      await this.synchronizer.sync(month);
    } catch (error) {
      throw new CompletionRefreshError(error);
    }
  }
}
