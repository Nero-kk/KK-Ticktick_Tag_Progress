import { describe, expect, it, vi } from 'vitest';
import { CompletionRefreshError, TaskCompletionService } from '../src/core/task-completion-service';

const task = {
  id: 'task-1',
  projectId: 'project-1',
  status: 'open' as const,
};

describe('TaskCompletionService', () => {
  it('completes remotely before refreshing the selected month', async () => {
    const order: string[] = [];
    const api = { completeTask: vi.fn(async () => { order.push('complete'); }) };
    const synchronizer = { sync: vi.fn(async () => { order.push('sync'); }) };
    const service = new TaskCompletionService(api, synchronizer);

    await service.completeAndRefresh('2026-07', task);

    expect(api.completeTask).toHaveBeenCalledWith('project-1', 'task-1');
    expect(synchronizer.sync).toHaveBeenCalledWith('2026-07');
    expect(order).toEqual(['complete', 'sync']);
  });

  it('coalesces repeated completion requests for the same task', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const api = { completeTask: vi.fn(() => blocked) };
    const synchronizer = { sync: vi.fn(async () => undefined) };
    const service = new TaskCompletionService(api, synchronizer);

    const first = service.completeAndRefresh('2026-07', task);
    const second = service.completeAndRefresh('2026-07', task);
    release();
    await Promise.all([first, second]);

    expect(api.completeTask).toHaveBeenCalledTimes(1);
    expect(synchronizer.sync).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a refresh failure after TickTick accepted completion', async () => {
    const api = { completeTask: vi.fn(async () => undefined) };
    const synchronizer = { sync: vi.fn(async () => { throw new Error('offline'); }) };
    const service = new TaskCompletionService(api, synchronizer);

    await expect(service.completeAndRefresh('2026-07', task)).rejects.toBeInstanceOf(CompletionRefreshError);
  });
});
