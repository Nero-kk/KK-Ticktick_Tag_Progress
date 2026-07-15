import type { NormalizedTask, TaskStatus, TickTickTask } from '../api/contracts';
import { systemTimeZone, toLocalDate } from './local-date';

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

export function normalizeTask(
  raw: TickTickTask,
  projectName: string,
  fallbackTimeZone: string = systemTimeZone(),
): NormalizedTask {
  const id = requireString(raw.id, 'id');
  const projectId = requireString(raw.projectId, 'projectId');
  const title = requireString(raw.title, 'title');
  const body = typeof raw.content === 'string'
    ? raw.content
    : typeof raw.desc === 'string'
      ? raw.desc
      : undefined;
  const startAt = typeof raw.startDate === 'string' ? raw.startDate : undefined;
  const dueAt = typeof raw.dueDate === 'string' ? raw.dueDate : undefined;
  const timeZone = typeof raw.timeZone === 'string' ? raw.timeZone : undefined;
  const isAllDay = raw.isAllDay === true;
  const localStartDate = startAt ? toLocalDate(startAt, timeZone, isAllDay, fallbackTimeZone) : null;
  const localDueDate = dueAt ? toLocalDate(dueAt, timeZone, isAllDay, fallbackTimeZone) : null;
  return {
    id,
    projectId,
    projectName: requireString(projectName, 'projectName'),
    title,
    ...(body === undefined ? {} : { content: body }),
    tags: Array.isArray(raw.tags) ? raw.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '') : [],
    status: normalizeStatus(raw.status),
    ...(startAt === undefined ? {} : { startAt }),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(typeof raw.completedTime === 'string' ? { completedAt: raw.completedTime } : {}),
    ...(timeZone === undefined ? {} : { timeZone }),
    isAllDay,
    ...(localStartDate ? { localStartDate } : {}),
    ...(localDueDate ? { localDueDate } : {}),
  };
}
