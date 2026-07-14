import { describe, expect, it, vi } from 'vitest';
import { CompletionRefreshError, TaskCompletionService } from '../src/core/task-completion-service';
import { TickTickHttpError } from '../src/api/errors';
import type { NormalizedTask } from '../src/api/contracts';

const target = { id: 'task-1', projectId: 'project-1', title: 'Draft', status: 'open' as const };

function live(overrides: Partial<NormalizedTask> = {}): NormalizedTask {
  return {
    id: 'task-1', projectId: 'project-1', projectName: 'P', title: 'Draft',
    tags: [], status: 'open', isAllDay: true, ...overrides,
  };
}

describe('TaskCompletionService', () => {
  describe('preflight', () => {
    it('reports ready when the live task still matches the snapshot', async () => {
      const api = { getTask: vi.fn(async () => live()), completeTask: vi.fn() };
      const result = await new TaskCompletionService(api, { sync: vi.fn() }).preflight(target);
      expect(result).toEqual({ status: 'ready', live: live(), changed: false });
    });

    it('flags a changed title/project without blocking', async () => {
      const api = { getTask: vi.fn(async () => live({ title: 'Renamed' })), completeTask: vi.fn() };
      const result = await new TaskCompletionService(api, { sync: vi.fn() }).preflight(target);
      expect(result).toMatchObject({ status: 'ready', changed: true });
    });

    it('reports already-completed when the live task is no longer open', async () => {
      const api = { getTask: vi.fn(async () => live({ status: 'completed' })), completeTask: vi.fn() };
      const result = await new TaskCompletionService(api, { sync: vi.fn() }).preflight(target);
      expect(result.status).toBe('already-completed');
    });

    it('reports not-found when the task was deleted or moved', async () => {
      const api = { getTask: vi.fn(async () => { throw new TickTickHttpError(404, 'not-found'); }), completeTask: vi.fn() };
      const result = await new TaskCompletionService(api, { sync: vi.fn() }).preflight(target);
      expect(result).toEqual({ status: 'not-found' });
    });
  });

  describe('complete', () => {
    it('completes, post-verifies, then refreshes the month', async () => {
      const order: string[] = [];
      const api = {
        getTask: vi.fn(async () => { order.push('verify'); return live({ status: 'completed' }); }),
        completeTask: vi.fn(async () => { order.push('complete'); }),
      };
      const synchronizer = { sync: vi.fn(async () => { order.push('sync'); }) };
      const result = await new TaskCompletionService(api, synchronizer).complete('2026-07', target);
      expect(result).toEqual({ status: 'completed' });
      expect(order).toEqual(['complete', 'verify', 'sync']);
      expect(synchronizer.sync).toHaveBeenCalledWith('2026-07');
    });

    it('returns unknown without refreshing when the POST times out', async () => {
      const api = {
        getTask: vi.fn(async () => live()),
        completeTask: vi.fn(async () => { throw new TickTickHttpError(0, 'unknown-outcome'); }),
      };
      const synchronizer = { sync: vi.fn(async () => undefined) };
      const result = await new TaskCompletionService(api, synchronizer).complete('2026-07', target);
      expect(result).toEqual({ status: 'unknown' });
      expect(synchronizer.sync).not.toHaveBeenCalled();
      expect(api.getTask).not.toHaveBeenCalled();
    });

    it('downgrades to completed-unverified when the post-write read still shows open', async () => {
      const api = {
        getTask: vi.fn(async () => live({ status: 'open' })),
        completeTask: vi.fn(async () => undefined),
      };
      const result = await new TaskCompletionService(api, { sync: vi.fn(async () => undefined) }).complete('2026-07', target);
      expect(result).toEqual({ status: 'completed-unverified' });
    });

    it('surfaces a refresh failure after TickTick accepted completion', async () => {
      const api = { getTask: vi.fn(async () => live({ status: 'completed' })), completeTask: vi.fn(async () => undefined) };
      const synchronizer = { sync: vi.fn(async () => { throw new Error('offline'); }) };
      await expect(new TaskCompletionService(api, synchronizer).complete('2026-07', target))
        .rejects.toBeInstanceOf(CompletionRefreshError);
    });

    it('rethrows a hard auth failure without refreshing', async () => {
      const api = {
        getTask: vi.fn(async () => live()),
        completeTask: vi.fn(async () => { throw new TickTickHttpError(401, 'auth'); }),
      };
      const synchronizer = { sync: vi.fn(async () => undefined) };
      await expect(new TaskCompletionService(api, synchronizer).complete('2026-07', target))
        .rejects.toMatchObject({ kind: 'auth' });
      expect(synchronizer.sync).not.toHaveBeenCalled();
    });
  });

  describe('confirmOutcome', () => {
    it('confirms completion and refreshes when the exact read shows completed', async () => {
      const api = { getTask: vi.fn(async () => live({ status: 'completed' })), completeTask: vi.fn() };
      const synchronizer = { sync: vi.fn(async () => undefined) };
      const result = await new TaskCompletionService(api, synchronizer).confirmOutcome('2026-07', target);
      expect(result).toEqual({ status: 'completed' });
      expect(synchronizer.sync).toHaveBeenCalledWith('2026-07');
    });

    it('reports still-open without refreshing when the task is unchanged', async () => {
      const api = { getTask: vi.fn(async () => live()), completeTask: vi.fn() };
      const synchronizer = { sync: vi.fn(async () => undefined) };
      const result = await new TaskCompletionService(api, synchronizer).confirmOutcome('2026-07', target);
      expect(result).toEqual({ status: 'still-open' });
      expect(synchronizer.sync).not.toHaveBeenCalled();
    });

    it('reports not-found when the task disappeared', async () => {
      const api = { getTask: vi.fn(async () => { throw new TickTickHttpError(404, 'not-found'); }), completeTask: vi.fn() };
      const result = await new TaskCompletionService(api, { sync: vi.fn() }).confirmOutcome('2026-07', target);
      expect(result).toEqual({ status: 'not-found' });
    });
  });
});
