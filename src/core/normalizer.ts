import type { NormalizedTask, TaskStatus, TickTickTask } from '../api/contracts';

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Invalid task ${field}`);
  return value;
}

function normalizeStatus(status: number): TaskStatus {
  if (status === 0) return 'open';
  if (status === 2) return 'completed';
  if (status === -1) return 'abandoned';
  return 'unknown';
}

export function normalizeTask(raw: TickTickTask, projectName: string): NormalizedTask {
  const id = requireString(raw.id, 'id');
  const projectId = requireString(raw.projectId, 'projectId');
  const title = requireString(raw.title, 'title');
  const body = typeof raw.content === 'string'
    ? raw.content
    : typeof raw.desc === 'string'
      ? raw.desc
      : undefined;
  return {
    id,
    projectId,
    projectName: requireString(projectName, 'projectName'),
    title,
    ...(body === undefined ? {} : { content: body }),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '') : [],
    status: normalizeStatus(raw.status),
    ...(typeof raw.startDate === 'string' ? { startAt: raw.startDate } : {}),
    ...(typeof raw.dueDate === 'string' ? { dueAt: raw.dueDate } : {}),
    ...(typeof raw.completedTime === 'string' ? { completedAt: raw.completedTime } : {}),
    ...(typeof raw.timeZone === 'string' ? { timeZone: raw.timeZone } : {}),
    isAllDay: raw.isAllDay === true,
  };
}
