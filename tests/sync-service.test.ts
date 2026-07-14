import { describe, expect, it } from 'vitest';
import { SyncService } from '../src/core/sync-service';
import { SnapshotStore } from '../src/core/snapshot-store';
import type { SyncApi } from '../src/core/sync-service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('SyncService', () => {
  it('coalesces rapid sync requests into one network flight', async () => {
    const projects = deferred<Array<{ id: string; name: string }>>();
    let calls = 0;
    const api: SyncApi = {
      getProjects: () => { calls += 1; return projects.promise; },
      getTags: async () => [], getProjectData: async () => ({ project: { id: 'p', name: 'P' }, tasks: [], columns: [] }),
      filterTasks: async () => [], getCompletedTasks: async () => [],
    };
    const service = new SyncService(api, new SnapshotStore());
    const first = service.sync('2026-07');
    const second = service.sync('2026-07');
    projects.resolve([]);
    await Promise.all([first, second]);
    expect(calls).toBe(1);
    expect(first).toBe(second);
  });

  it('keeps last-good when a required call fails', async () => {
    const store = new SnapshotStore();
    const api: SyncApi = {
      getProjects: async () => [{ id: 'p', name: 'P' }], getTags: async () => [],
      getProjectData: async () => { throw new Error('offline'); }, filterTasks: async () => [], getCompletedTasks: async () => [],
    };
    const service = new SyncService(api, store);
    await expect(service.sync('2026-07')).rejects.toThrow(/offline/);
    expect(store.getLastGood('2026-07')).toBeUndefined();
    expect(store.getLastAttempt()?.result).toBe('network');
  });

  it('strips task content from the persisted snapshot', async () => {
    const store = new SnapshotStore();
    const api: SyncApi = {
      getProjects: async () => [{ id: 'p', name: 'P' }], getTags: async () => [],
      getProjectData: async () => ({ project: { id: 'p', name: 'P' }, columns: [], tasks: [{ id: 't', projectId: 'p', title: 'T', content: 'private body', priority: 0, status: 0 }] }),
      filterTasks: async () => [], getCompletedTasks: async () => [],
    };
    const snapshot = await new SyncService(api, store).sync('2026-07');
    expect(snapshot.tasks[0]).not.toHaveProperty('content');
    expect(JSON.stringify(store.exportState())).not.toContain('private body');
  });

  it('collects a KST month-boundary task surfaced by the widened query and places it in the month', async () => {
    const store = new SnapshotStore();
    const captured: Array<{ startDate?: string; endDate?: string }> = [];
    const api: SyncApi = {
      getProjects: async () => [{ id: 'p', name: 'P' }], getTags: async () => [],
      getProjectData: async () => ({ project: { id: 'p', name: 'P' }, columns: [], tasks: [] }),
      filterTasks: async (filter) => {
        captured.push({ startDate: filter.startDate, endDate: filter.endDate });
        return [{ id: 'boundary', projectId: 'p', title: 'Boundary', priority: 0, status: 0, isAllDay: false, startDate: '2026-06-30T15:30:00.000+0000', dueDate: '2026-06-30T16:00:00.000+0000', timeZone: 'Asia/Seoul' }];
      },
      getCompletedTasks: async () => [],
    };

    const snapshot = await new SyncService(api, store).sync('2026-07');

    expect(captured[0]).toEqual({ startDate: '2026-06-30', endDate: '2026-08-01' });
    expect(snapshot.tasks.map((task) => task.id)).toEqual(['boundary']);
    expect(snapshot.tasks[0]?.localStartDate).toBe('2026-07-01');
  });

  it('keeps only project-data tasks that overlap the selected month or are unscheduled', async () => {
    const store = new SnapshotStore();
    const api: SyncApi = {
      getProjects: async () => [{ id: 'p', name: 'P' }], getTags: async () => [],
      getProjectData: async () => ({
        project: { id: 'p', name: 'P' }, columns: [], tasks: [
          { id: 'july', projectId: 'p', title: 'July', priority: 0, status: 0, startDate: '2026-07-01', dueDate: '2026-07-31' },
          { id: 'future', projectId: 'p', title: 'Future', priority: 0, status: 0, startDate: '2026-08-01', dueDate: '2026-08-31' },
          { id: 'unscheduled', projectId: 'p', title: 'Unscheduled', priority: 0, status: 0 },
        ],
      }),
      filterTasks: async () => [], getCompletedTasks: async () => [],
    };

    const snapshot = await new SyncService(api, store).sync('2026-07');

    expect(snapshot.tasks.map((task) => task.id)).toEqual(['july', 'unscheduled']);
    expect(snapshot.coverage.openTaskCount).toBe(2);
  });
});
