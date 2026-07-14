import type { NormalizedTask } from '../api/contracts';

interface CompletionApi {
  completeTask(projectId: string, taskId: string): Promise<void>;
}

interface MonthSynchronizer {
  sync(month: string): Promise<unknown>;
}

type CompletionTarget = Pick<NormalizedTask, 'id' | 'projectId' | 'status'>;

export class CompletionRefreshError extends Error {
  constructor(cause: unknown) {
    super('TickTick accepted completion, but the local refresh failed', { cause });
    this.name = 'CompletionRefreshError';
  }
}

export class TaskCompletionService {
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly api: CompletionApi,
    private readonly synchronizer: MonthSynchronizer,
  ) {}

  completeAndRefresh(month: string, task: CompletionTarget): Promise<void> {
    if (task.status !== 'open') return Promise.resolve();
    const key = `${task.projectId}:${task.id}`;
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const operation = this.run(month, task).finally(() => {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key);
    });
    this.inFlight.set(key, operation);
    return operation;
  }

  private async run(month: string, task: CompletionTarget): Promise<void> {
    await this.api.completeTask(task.projectId, task.id);
    try {
      await this.synchronizer.sync(month);
    } catch (error) {
      throw new CompletionRefreshError(error);
    }
  }
}
