import type { NormalizedTask, SyncCoverage, SyncSnapshot, TaskStatus } from '../api/contracts';
import { systemTimeZone, toLocalDate } from './local-date';

export interface LastAttempt {
  selectedMonth: string;
  attemptedAt: string;
  result: 'success' | 'auth' | 'rate-limit' | 'server' | 'contract' | 'network';
  reason?: string;
}

export interface SnapshotState {
  snapshots: Record<string, SyncSnapshot>;
  lastAttempt?: LastAttempt;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringArray(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? [...value] : null;
}

function sanitizeTask(value: unknown): NormalizedTask | null {
  const item = record(value);
  if (!item || !nonEmptyString(item.id) || !nonEmptyString(item.projectId)
    || !nonEmptyString(item.projectName) || !nonEmptyString(item.title)) return null;
  const tags = stringArray(item.tags);
  const statuses: TaskStatus[] = ['open', 'completed', 'abandoned', 'unknown'];
  if (!tags || typeof item.status !== 'string' || !statuses.includes(item.status as TaskStatus)
    || typeof item.isAllDay !== 'boolean') return null;
  const startAt = optionalString(item.startAt);
  const dueAt = optionalString(item.dueAt);
  const timeZone = optionalString(item.timeZone);
  // Recompute local dates on load so v1 snapshots migrate transparently and the
  // task's own time zone is honoured (matches normalizeTask). Stored values are
  // ignored to keep a single derivation path.
  const fallbackTimeZone = systemTimeZone();
  const localStartDate = startAt ? toLocalDate(startAt, timeZone, item.isAllDay, fallbackTimeZone) : null;
  const localDueDate = dueAt ? toLocalDate(dueAt, timeZone, item.isAllDay, fallbackTimeZone) : null;
  return {
    id: item.id,
    projectId: item.projectId,
    projectName: item.projectName,
    title: item.title,
    tags,
    status: item.status as TaskStatus,
    ...(startAt === undefined ? {} : { startAt }),
    ...(dueAt === undefined ? {} : { dueAt }),
    ...(optionalString(item.completedAt) === undefined ? {} : { completedAt: optionalString(item.completedAt) }),
    ...(timeZone === undefined ? {} : { timeZone }),
    isAllDay: item.isAllDay,
    ...(localStartDate ? { localStartDate } : {}),
    ...(localDueDate ? { localDueDate } : {}),
  };
}

function sanitizeCoverage(value: unknown, selectedMonth: string): SyncCoverage | null {
  const item = record(value);
  if (!item || item.status !== 'complete' || item.selectedMonth !== selectedMonth) return null;
  const projectIds = stringArray(item.projectIds);
  const successfulCalls = stringArray(item.successfulCalls);
  if (!projectIds || !successfulCalls || !Array.isArray(item.failedCalls)
    || typeof item.openTaskCount !== 'number' || !Number.isFinite(item.openTaskCount)
    || typeof item.completedTaskCount !== 'number' || !Number.isFinite(item.completedTaskCount)) return null;
  const failedCalls: Array<{ call: string; reason: string }> = [];
  for (const failure of item.failedCalls) {
    const entry = record(failure);
    if (!entry || !nonEmptyString(entry.call) || typeof entry.reason !== 'string') return null;
    failedCalls.push({ call: entry.call, reason: entry.reason });
  }
  return {
    status: 'complete', selectedMonth, projectIds, successfulCalls, failedCalls,
    openTaskCount: item.openTaskCount, completedTaskCount: item.completedTaskCount,
  };
}

function sanitizeSnapshot(value: unknown): SyncSnapshot | null {
  const item = record(value);
  if (!item || (item.schemaVersion !== 1 && item.schemaVersion !== 2) || !nonEmptyString(item.selectedMonth)
    || !/^\d{4}-(0[1-9]|1[0-2])$/.test(item.selectedMonth) || !nonEmptyString(item.generatedAt)
    || !Array.isArray(item.tasks)) return null;
  const coverage = sanitizeCoverage(item.coverage, item.selectedMonth);
  if (!coverage) return null;
  const tasks: NormalizedTask[] = [];
  for (const task of item.tasks) {
    const sanitized = sanitizeTask(task);
    if (!sanitized) return null;
    tasks.push(sanitized);
  }
  return {
    schemaVersion: 2,
    selectedMonth: item.selectedMonth,
    generatedAt: item.generatedAt,
    coverage,
    tasks,
  };
}

function sanitizeLastAttempt(value: unknown): LastAttempt | undefined {
  const item = record(value);
  const results: LastAttempt['result'][] = ['success', 'auth', 'rate-limit', 'server', 'contract', 'network'];
  if (!item || !nonEmptyString(item.selectedMonth) || !nonEmptyString(item.attemptedAt)
    || typeof item.result !== 'string' || !results.includes(item.result as LastAttempt['result'])) return undefined;
  return {
    selectedMonth: item.selectedMonth,
    attemptedAt: item.attemptedAt,
    result: item.result as LastAttempt['result'],
    ...(typeof item.reason === 'string' ? { reason: item.reason } : {}),
  };
}

function sanitizeState(value: unknown): SnapshotState {
  const item = record(value);
  const source = record(item?.snapshots);
  const snapshots: Record<string, SyncSnapshot> = {};
  if (source) {
    for (const [month, candidate] of Object.entries(source)) {
      const snapshot = sanitizeSnapshot(candidate);
      if (snapshot?.selectedMonth === month) snapshots[month] = snapshot;
    }
  }
  const lastAttempt = sanitizeLastAttempt(item?.lastAttempt);
  return { snapshots, ...(lastAttempt ? { lastAttempt } : {}) };
}

export class SnapshotStore {
  private state: SnapshotState;

  constructor(initial: unknown = { snapshots: {} }) {
    this.state = sanitizeState(initial);
  }

  accept(snapshot: SyncSnapshot): void {
    const sanitized = sanitizeSnapshot(snapshot);
    if (!sanitized || sanitized.coverage.status !== 'complete') throw new Error('Only valid complete snapshots can replace last-good');
    this.state.snapshots[sanitized.selectedMonth] = sanitized;
    this.state.lastAttempt = { selectedMonth: sanitized.selectedMonth, attemptedAt: sanitized.generatedAt, result: 'success' };
  }

  recordFailure(selectedMonth: string, result: Exclude<LastAttempt['result'], 'success'>, reason: string): void {
    this.state.lastAttempt = { selectedMonth, attemptedAt: new Date().toISOString(), result, reason };
  }

  getLastGood(selectedMonth: string): SyncSnapshot | undefined {
    const snapshot = this.state.snapshots[selectedMonth];
    return snapshot ? clone(snapshot) : undefined;
  }

  getLastAttempt(): LastAttempt | undefined {
    return this.state.lastAttempt ? clone(this.state.lastAttempt) : undefined;
  }

  exportState(): SnapshotState {
    return clone(sanitizeState(this.state));
  }
}
