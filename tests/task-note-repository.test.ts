import { describe, expect, it } from 'vitest';
import { TaskNoteRepository, type TaskNotePort } from '../src/notes/task-note-repository';
import type { NormalizedTask } from '../src/api/contracts';

const task: NormalizedTask = {
  id: '0123456789abcdef', projectId: 'p', projectName: 'UNIOS8K', title: '검토',
  content: '본문', tags: ['UNIOS8K'], status: 'open', isAllDay: true,
};

function memoryPort(
  initial: Array<{ path: string; ticktickId: string }> = [],
  projectFolders = ['UNIOS8K'],
): TaskNotePort & { created: string[]; opened: string[]; updated: string[] } {
  const created: string[] = [];
  const opened: string[] = [];
  const updated: string[] = [];
  return {
    created, opened, updated,
    listTaskNotes: async () => initial,
    listProjectFolders: async () => projectFolders,
    ensureFolder: async () => undefined,
    create: async (path) => { created.push(path); return path; },
    update: async (path) => { updated.push(path); },
    open: async (path) => { opened.push(path); },
  };
}

describe('TaskNoteRepository', () => {
  it('opens an exact existing TickTick ID without creating a duplicate', async () => {
    const port = memoryPort([{ path: '40. Projects/UNIOS8K/TickTick Notes/existing.md', ticktickId: task.id }]);
    await new TaskNoteRepository(port, {}).openOrCreate(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' }, false);
    expect(port.created).toEqual([]);
    expect(port.updated).toEqual(['40. Projects/UNIOS8K/TickTick Notes/existing.md']);
    expect(port.opened).toEqual(['40. Projects/UNIOS8K/TickTick Notes/existing.md']);
  });

  it('creates one note in the canonical project folder', async () => {
    const port = memoryPort();
    const repository = new TaskNoteRepository(port, {});
    await repository.openOrCreate(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' }, false);
    expect(port.created).toEqual(['40. Projects/UNIOS8K/TickTick Notes/검토--89abcdef.md']);
    expect(port.opened).toEqual(port.created);
  });

  it('falls back to one canonical task tag when TickTick uses a shared project', async () => {
    const port = memoryPort([], ['UNIOS8K', 'UNI610H', 'UNI650A']);
    const sharedProjectTask = {
      ...task,
      projectName: '🌐UNITEST',
      title: 'Chiller 미팅',
      tags: ['u650a'],
    };

    await new TaskNoteRepository(port, {}).openOrCreate(
      sharedProjectTask,
      { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' },
      false,
    );

    expect(port.created).toEqual(['40. Projects/UNI650A/TickTick Notes/Chiller 미팅--89abcdef.md']);
  });

  it('fails closed for duplicate IDs or unmapped projects', async () => {
    const duplicate = memoryPort([
      { path: 'a.md', ticktickId: task.id }, { path: 'b.md', ticktickId: task.id },
    ]);
    await expect(new TaskNoteRepository(duplicate, {}).openOrCreate(task, { syncedAt: 'x', coverage: 'complete' }, false)).rejects.toThrow(/duplicate/i);

    const unmappedPort = memoryPort();
    await expect(new TaskNoteRepository(unmappedPort, {}).openOrCreate({ ...task, projectName: 'TYPO', tags: ['TYPO'] }, { syncedAt: 'x', coverage: 'complete' }, false)).rejects.toThrow(/mapping/i);
  });

  it('fails closed when shared-project tags map to multiple project folders', async () => {
    const port = memoryPort([], ['UNIOS8K', 'UNI650A']);
    await expect(new TaskNoteRepository(port, {}).openOrCreate({
      ...task,
      projectName: '🌐UNITEST',
      tags: ['uos8k', 'u650a'],
    }, { syncedAt: 'x', coverage: 'complete' }, false)).rejects.toThrow(/ambiguous/i);
  });

  it('single-flights concurrent opens for the same exact TickTick ID', async () => {
    let createCalls = 0;
    const port = memoryPort();
    port.create = async (path) => {
      createCalls += 1;
      await Promise.resolve();
      port.created.push(path);
      return path;
    };
    const repository = new TaskNoteRepository(port, {});
    await Promise.all([
      repository.openOrCreate(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' }, false),
      repository.openOrCreate(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' }, true),
    ]);
    expect(createCalls).toBe(1);
    expect(port.opened).toHaveLength(2);
  });
});
