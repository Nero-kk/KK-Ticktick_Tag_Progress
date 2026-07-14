import { describe, expect, it } from 'vitest';
import { normalizeTask } from '../src/core/normalizer';

describe('normalizeTask', () => {
  it('normalizes an official completed task without inventing fields', () => {
    expect(normalizeTask({
      id: 'task-1', projectId: 'project-1', title: '검토', priority: 3, status: 2,
      startDate: '2026-07-01T00:00:00+0900', dueDate: '2026-07-18T00:00:00+0900',
      completedTime: '2026-07-12T09:00:00+0900', isAllDay: true, tags: ['UNIOS8K'],
    }, 'UNIOS8K')).toMatchObject({
      id: 'task-1', projectId: 'project-1', projectName: 'UNIOS8K', title: '검토',
      status: 'completed', tags: ['UNIOS8K'], isAllDay: true,
    });
  });

  it('maps abandoned and unknown statuses without counting them as open', () => {
    expect(normalizeTask({ id: 'a', projectId: 'p', title: 'A', priority: 0, status: -1 }, 'P').status).toBe('abandoned');
    expect(normalizeTask({ id: 'b', projectId: 'p', title: 'B', priority: 0, status: 9 }, 'P').status).toBe('unknown');
  });

  it('rejects malformed required fields', () => {
    expect(() => normalizeTask({ id: '', projectId: 'p', title: 'A', priority: 0, status: 0 }, 'P')).toThrow(/id/);
  });

  it('uses the official checklist description when content is absent', () => {
    expect(normalizeTask({
      id: 'checklist', projectId: 'p', title: 'Checklist', desc: 'Checklist body', priority: 0, status: 0,
    }, 'P').content).toBe('Checklist body');
  });

  it('derives local dates from a timed task using the task time zone', () => {
    const task = normalizeTask({
      id: 'timed', projectId: 'p', title: 'Timed', priority: 0, status: 0, isAllDay: false,
      startDate: '2026-06-30T15:00:00.000+0000', dueDate: '2026-07-14T15:00:00.000+0000', timeZone: 'Asia/Seoul',
    }, 'P', 'UTC');
    expect(task.localStartDate).toBe('2026-07-01');
    expect(task.localDueDate).toBe('2026-07-15');
  });

  it('keeps all-day dates as floating calendar dates', () => {
    const task = normalizeTask({
      id: 'allday', projectId: 'p', title: 'All day', priority: 0, status: 0, isAllDay: true,
      startDate: '2026-07-01T00:00:00.000+0000', dueDate: '2026-07-03T00:00:00.000+0000', timeZone: 'America/Los_Angeles',
    }, 'P', 'UTC');
    expect(task.localStartDate).toBe('2026-07-01');
    expect(task.localDueDate).toBe('2026-07-03');
  });
});
