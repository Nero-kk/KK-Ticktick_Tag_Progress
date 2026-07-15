import { describe, expect, it } from 'vitest';
import { SnapshotStore } from '../src/core/snapshot-store';
import type { SyncSnapshot } from '../src/api/contracts';

const good: SyncSnapshot = {
  schemaVersion: 2, selectedMonth: '2026-07', generatedAt: '2026-07-14T00:00:00Z',
  coverage: { status: 'complete', selectedMonth: '2026-07', projectIds: ['p'], successfulCalls: ['project'], failedCalls: [], openTaskCount: 1, completedTaskCount: 0, unknownTaskCount: 0 },
  tasks: [{ id: 't', projectId: 'p', projectName: 'P', title: 'T', tags: ['A'], status: 'open', startAt: '2026-07-01', dueAt: '2026-07-02', isAllDay: true, localStartDate: '2026-07-01', localDueDate: '2026-07-02' }],
};

describe('SnapshotStore', () => {
  it('replaces last-good only for complete snapshots', () => {
    const store = new SnapshotStore();
    store.accept(good);
    store.recordFailure('2026-07', 'network', 'timeout');
    expect(store.getLastGood('2026-07')).toEqual(good);
    expect(store.getLastAttempt()?.result).toBe('network');
  });

  it('returns defensive copies', () => {
    const store = new SnapshotStore({ snapshots: { '2026-07': good } });
    const copy = store.getLastGood('2026-07');
    copy!.tasks[0]!.title = 'mutated';
    expect(store.getLastGood('2026-07')?.tasks[0]?.title).toBe('T');
  });

  it('sanitizes task bodies from loaded and exported snapshot state', () => {
    const dirty = structuredClone(good) as SyncSnapshot & { tasks: Array<SyncSnapshot['tasks'][number] & { content?: string }> };
    dirty.tasks[0]!.content = 'must not persist';
    const store = new SnapshotStore({ snapshots: { '2026-07': dirty } });
    expect(JSON.stringify(store.exportState())).not.toContain('must not persist');
    expect(store.getLastGood('2026-07')?.tasks[0]).not.toHaveProperty('content');
  });

  it('migrates a v1 snapshot by recomputing local dates and bumping the schema', () => {
    const legacy = {
      schemaVersion: 1, selectedMonth: '2026-07', generatedAt: '2026-07-14T00:00:00Z',
      coverage: { status: 'complete', selectedMonth: '2026-07', projectIds: ['p'], successfulCalls: ['project'], failedCalls: [], openTaskCount: 1, completedTaskCount: 0 },
      tasks: [{ id: 't', projectId: 'p', projectName: 'P', title: 'T', tags: ['A'], status: 'open', startAt: '2026-06-30T15:00:00.000+0000', dueAt: '2026-07-05T15:00:00.000+0000', timeZone: 'Asia/Seoul', isAllDay: false }],
    };
    const store = new SnapshotStore({ snapshots: { '2026-07': legacy } });
    const loaded = store.getLastGood('2026-07');
    expect(loaded?.schemaVersion).toBe(2);
    expect(loaded?.tasks[0]).toMatchObject({ localStartDate: '2026-07-01', localDueDate: '2026-07-06' });
  });

  it('quarantines unknown or malformed snapshot schemas', () => {
    const store = new SnapshotStore({ snapshots: { '2026-07': { ...good, schemaVersion: 99 } } });
    expect(store.getLastGood('2026-07')).toBeUndefined();
  });
});
