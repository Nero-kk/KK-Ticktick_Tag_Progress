import { describe, expect, it } from 'vitest';
import { aggregateTagProgress, UNTAGGED_KEY } from '../src/core/tag-progress-aggregator';
import type { NormalizedTask } from '../src/api/contracts';

function task(
  id: string,
  status: NormalizedTask['status'],
  tags: string[],
  startAt: string | undefined = '2026-07-01',
  dueAt: string | undefined = '2026-07-10',
): NormalizedTask {
  return {
    id, projectId: 'p', projectName: 'P', title: id, tags, status, isAllDay: true,
    ...(startAt ? { startAt, localStartDate: startAt } : {}),
    ...(dueAt ? { dueAt, localDueDate: dueAt } : {}),
  };
}

describe('aggregateTagProgress', () => {
  it('calculates 60/80 as 75 percent and retains the visible span', () => {
    const tasks = [
      ...Array.from({ length: 60 }, (_, i) => task(`done-${i}`, 'completed', ['UNIOS8K'])),
      ...Array.from({ length: 20 }, (_, i) => task(`open-${i}`, 'open', ['UNIOS8K'])),
    ];
    expect(aggregateTagProgress(tasks, '2026-07')[0]).toMatchObject({
      displayName: 'UNIOS8K', completed: 60, open: 20, total: 80, percent: 75,
      visibleStartDay: 1, visibleEndDay: 10,
    });
  });

  it('deduplicates task IDs while letting a multi-tag task contribute once per tag', () => {
    const shared = task('same', 'open', ['Ａ', 'B']);
    const rows = aggregateTagProgress([shared, shared, task('done', 'completed', ['a'])], '2026-07');
    expect(rows.map((row) => [row.tagKey, row.total])).toEqual([['a', 2], ['b', 1]]);
  });

  it('keeps unscheduled tasks outside the denominator and reports them', () => {
    const unscheduled: NormalizedTask = { id: 'u', projectId: 'p', projectName: 'P', title: 'u', tags: ['A'], status: 'open', isAllDay: true };
    expect(aggregateTagProgress([task('s', 'completed', ['A']), unscheduled], '2026-07')[0]).toMatchObject({
      completed: 1, open: 0, total: 1, hasUnscheduledTasks: true, unscheduledCount: 1,
    });
  });

  it('excludes abandoned and unknown tasks', () => {
    expect(aggregateTagProgress([task('a', 'abandoned', ['A']), task('u', 'unknown', ['A'])], '2026-07')).toEqual([]);
  });

  it('gathers untagged tasks under a reserved key only when showUntagged is on', () => {
    const untagged = task('u', 'open', []);
    expect(aggregateTagProgress([untagged], '2026-07')).toEqual([]);
    const [row] = aggregateTagProgress([untagged], '2026-07', { showUntagged: true });
    expect(row).toMatchObject({ tagKey: UNTAGGED_KEY, displayName: '미분류', total: 1 });
  });

  it('keeps a real "미분류" tag separate from the reserved untagged row', () => {
    const rows = aggregateTagProgress(
      [task('real', 'open', ['미분류']), task('none', 'open', [])],
      '2026-07',
      { showUntagged: true },
    );
    const keys = rows.map((row) => row.tagKey);
    expect(keys).toContain('미분류');
    expect(keys).toContain(UNTAGGED_KEY);
    expect(keys).toHaveLength(2);
  });
});
