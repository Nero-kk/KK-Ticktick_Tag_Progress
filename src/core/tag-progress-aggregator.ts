import type { NormalizedTask, TagProgress } from '../api/contracts';
import { clampTaskToMonth } from './period';

interface MutableRow extends TagProgress {
  taskIdSet: Set<string>;
}

export function normalizeTagKey(tag: string): string {
  return tag.normalize('NFKC').toLocaleLowerCase('en-US');
}

export function aggregateTagProgress(
  input: NormalizedTask[],
  month: string,
  options: { showUntagged?: boolean } = {},
): TagProgress[] {
  const uniqueTasks = new Map<string, NormalizedTask>();
  for (const task of input) if (!uniqueTasks.has(task.id)) uniqueTasks.set(task.id, task);
  const rows = new Map<string, MutableRow>();

  for (const task of uniqueTasks.values()) {
    if (task.status !== 'open' && task.status !== 'completed') continue;
    const rawTags = task.tags.length > 0 ? task.tags : options.showUntagged ? ['미분류'] : [];
    if (rawTags.length === 0) continue;
    const start = task.localStartDate ?? task.localDueDate;
    const due = task.localDueDate ?? task.localStartDate;
    const span = start && due ? clampTaskToMonth(start, due, month) : null;
    const unscheduled = !start && !due;
    if (!span && !unscheduled) continue;

    const seenTags = new Set<string>();
    for (const rawTag of rawTags) {
      const tagKey = normalizeTagKey(rawTag);
      if (seenTags.has(tagKey)) continue;
      seenTags.add(tagKey);
      const row = rows.get(tagKey) ?? {
        tagKey,
        displayName: rawTag.normalize('NFKC'),
        completed: 0,
        open: 0,
        total: 0,
        percent: 0,
        clippedBeforeMonth: false,
        clippedAfterMonth: false,
        hasUnscheduledTasks: false,
        unscheduledCount: 0,
        taskIds: [],
        taskIdSet: new Set<string>(),
      };
      if (!row.taskIdSet.has(task.id)) {
        row.taskIdSet.add(task.id);
        row.taskIds.push(task.id);
        if (unscheduled) {
          row.hasUnscheduledTasks = true;
          row.unscheduledCount += 1;
        } else if (span) {
          row[task.status] += 1;
          row.total += 1;
          row.visibleStartDay = row.visibleStartDay === undefined ? span.startDay : Math.min(row.visibleStartDay, span.startDay);
          row.visibleEndDay = row.visibleEndDay === undefined ? span.endDay : Math.max(row.visibleEndDay, span.endDay);
          row.clippedBeforeMonth ||= span.clippedBeforeMonth;
          row.clippedAfterMonth ||= span.clippedAfterMonth;
        }
      }
      row.percent = row.total === 0 ? 0 : Math.round((row.completed / row.total) * 1000) / 10;
      rows.set(tagKey, row);
    }
  }

  return [...rows.values()]
    .filter((row) => row.total > 0 || row.unscheduledCount > 0)
    .sort((a, b) => a.tagKey.localeCompare(b.tagKey))
    .map(({ taskIdSet: _taskIdSet, ...row }) => row);
}
