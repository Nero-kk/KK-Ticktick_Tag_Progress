import type { NormalizedTask, TagProgress } from '../api/contracts';
import { clampTaskToMonth } from './period';

interface MutableRow extends TagProgress {
  taskIdSet: Set<string>;
}

/**
 * Reserved key for the virtual row that gathers tasks without any tag. It is not
 * a valid normalized user tag (those never contain '__'), so a real tag literally
 * named "미분류" stays a distinct row instead of merging into this bucket.
 */
export const UNTAGGED_KEY = '__untagged__';
export const UNTAGGED_DISPLAY = '미분류';

export function normalizeTagKey(tag: string): string {
  return tag.normalize('NFKC').toLocaleLowerCase('en-US');
}

/**
 * Orders rows for the portfolio view: tags listed in `includeTags` follow that
 * order (user-chosen priority), any remaining tags stay alphabetical, and the
 * untagged bucket is always pinned last as its own "기타" group.
 */
export function orderTagRows(rows: TagProgress[], includeTags: string[]): TagProgress[] {
  const order = new Map(includeTags.map((tag, index) => [normalizeTagKey(tag), index]));
  return [...rows].sort((a, b) => {
    const aUntagged = a.tagKey === UNTAGGED_KEY;
    const bUntagged = b.tagKey === UNTAGGED_KEY;
    if (aUntagged !== bUntagged) return aUntagged ? 1 : -1;
    const aRank = order.get(a.tagKey);
    const bRank = order.get(b.tagKey);
    if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
    if (aRank !== undefined) return -1;
    if (bRank !== undefined) return 1;
    return a.tagKey.localeCompare(b.tagKey);
  });
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
    const tagEntries = task.tags.length > 0
      ? task.tags.map((raw) => ({ tagKey: normalizeTagKey(raw), displayName: raw.normalize('NFKC') }))
      : options.showUntagged ? [{ tagKey: UNTAGGED_KEY, displayName: UNTAGGED_DISPLAY }] : [];
    if (tagEntries.length === 0) continue;
    const start = task.localStartDate ?? task.localDueDate;
    const due = task.localDueDate ?? task.localStartDate;
    const span = start && due ? clampTaskToMonth(start, due, month) : null;
    const unscheduled = !start && !due;
    if (!span && !unscheduled) continue;

    const seenTags = new Set<string>();
    for (const { tagKey, displayName } of tagEntries) {
      if (seenTags.has(tagKey)) continue;
      seenTags.add(tagKey);
      const row = rows.get(tagKey) ?? {
        tagKey,
        displayName,
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
