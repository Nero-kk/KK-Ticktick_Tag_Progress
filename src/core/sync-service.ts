import type {
  SyncSnapshot,
  TaskFilter,
  TickTickProject,
  TickTickProjectData,
  TickTickTask,
} from '../api/contracts';
import { TickTickHttpError } from '../api/errors';
import { systemTimeZone, toLocalDate } from './local-date';
import { normalizeTask } from './normalizer';
import { clampTaskToMonth, getQueryRange } from './period';
import { SnapshotStore } from './snapshot-store';

export interface SyncApi {
  getProjects(): Promise<TickTickProject[]>;
  getProjectData(projectId: string): Promise<TickTickProjectData>;
  getTask(projectId: string, taskId: string): Promise<TickTickTask>;
  filterTasks(filter: TaskFilter): Promise<TickTickTask[]>;
  getCompletedTasks(filter: Pick<TaskFilter, 'projectIds' | 'startDate' | 'endDate'>): Promise<TickTickTask[]>;
}

function failureReason(error: unknown): string {
  if (error instanceof TickTickHttpError) return error.kind;
  return error instanceof Error ? error.message : 'unknown';
}

export class SyncService {
  private readonly inFlight = new Map<string, Promise<SyncSnapshot>>();

  constructor(private readonly api: SyncApi, private readonly store: SnapshotStore) {}

  sync(selectedMonth: string): Promise<SyncSnapshot> {
    const existing = this.inFlight.get(selectedMonth);
    if (existing) return existing;
    const flight = this.performSync(selectedMonth).finally(() => {
      if (this.inFlight.get(selectedMonth) === flight) this.inFlight.delete(selectedMonth);
    });
    this.inFlight.set(selectedMonth, flight);
    return flight;
  }

  private async performSync(selectedMonth: string): Promise<SyncSnapshot> {
    try {
      const projects = await this.api.getProjects();
      const projectIds = projects.filter((project) => !project.closed).map((project) => project.id);
      const queryRange = getQueryRange(selectedMonth);
      const successfulCalls: string[] = ['project'];
      const failedCalls: Array<{ call: string; reason: string }> = [];

      // Per-project data and the two task queries degrade independently: one
      // failure yields a partial snapshot rather than losing the whole month.
      const projectData = await Promise.all(projectIds.map(async (id) => {
        try {
          const data = await this.api.getProjectData(id);
          successfulCalls.push(`project/${id}/data`);
          return data;
        } catch (error) {
          failedCalls.push({ call: `project/${id}/data`, reason: failureReason(error) });
          return null;
        }
      }));
      const [filteredResult, completedResult] = await Promise.allSettled([
        this.api.filterTasks({ projectIds, ...queryRange, status: [0, 2] }),
        this.api.getCompletedTasks({ projectIds, ...queryRange }),
      ]);
      const filtered = this.unwrap(filteredResult, 'task/filter', successfulCalls, failedCalls);
      const completed = this.unwrap(completedResult, 'task/completed', successfulCalls, failedCalls);

      // Only 'project' succeeded: every task-bearing call failed, so there is
      // nothing trustworthy to show. Keep last-good instead of writing an empty
      // snapshot over it.
      if (successfulCalls.length === 1 && failedCalls.length > 0) {
        throw new TickTickHttpError(0, 'network', 'TickTick sync produced no usable data');
      }

      const projectNames = new Map(projects.map((project) => [project.id, project.name]));
      const fallbackTimeZone = systemTimeZone();
      const inScope = (raw: TickTickTask): boolean => {
        const start = raw.startDate ?? raw.dueDate;
        const due = raw.dueDate ?? raw.startDate;
        if (!start && !due) return true;
        const isAllDay = raw.isAllDay === true;
        const localStart = start ? toLocalDate(start, raw.timeZone, isAllDay, fallbackTimeZone) : null;
        const localDue = due ? toLocalDate(due, raw.timeZone, isAllDay, fallbackTimeZone) : null;
        return Boolean(localStart && localDue && clampTaskToMonth(localStart, localDue, selectedMonth));
      };
      const rawById = new Map<string, TickTickTask>();
      const statusById = new Map<string, Set<number>>();
      const allRaw = [
        ...filtered,
        ...completed,
        ...projectData.flatMap((data) => data?.tasks ?? []),
      ];
      for (const raw of allRaw) {
        if (!raw?.id || !inScope(raw)) continue;
        const seen = statusById.get(raw.id) ?? new Set<number>();
        seen.add(raw.status);
        statusById.set(raw.id, seen);
        if (!rawById.has(raw.id)) rawById.set(raw.id, raw);
      }

      // Sources disagree on this task's status: don't guess. Resolve with an
      // exact read; if that also fails, mark it unknown so it is excluded from
      // aggregation rather than silently taking whichever source arrived first.
      for (const [id, statuses] of statusById) {
        if (statuses.size <= 1) continue;
        const raw = rawById.get(id)!;
        try {
          const exact = await this.api.getTask(raw.projectId, id);
          rawById.set(id, exact);
          successfulCalls.push(`project/${raw.projectId}/task/${id}`);
        } catch (error) {
          rawById.set(id, { ...raw, status: 9 });
          failedCalls.push({ call: `project/${raw.projectId}/task/${id}`, reason: failureReason(error) });
        }
      }

      const tasks = [...rawById.values()].map((raw) => {
        const normalized = normalizeTask(raw, projectNames.get(raw.projectId) ?? raw.projectId, fallbackTimeZone);
        delete normalized.content;
        return normalized;
      });
      const generatedAt = new Date().toISOString();
      const snapshot: SyncSnapshot = {
        schemaVersion: 2,
        selectedMonth,
        generatedAt,
        coverage: {
          status: failedCalls.length === 0 ? 'complete' : 'partial',
          selectedMonth,
          projectIds,
          successfulCalls,
          failedCalls,
          openTaskCount: tasks.filter((task) => task.status === 'open').length,
          completedTaskCount: tasks.filter((task) => task.status === 'completed').length,
          unknownTaskCount: tasks.filter((task) => task.status === 'unknown').length,
        },
        tasks,
      };
      this.store.accept(snapshot);
      return snapshot;
    } catch (error) {
      const kind = error instanceof TickTickHttpError ? error.kind : 'network';
      const result = kind === 'auth' || kind === 'rate-limit' || kind === 'server' || kind === 'contract'
        ? kind
        : 'network';
      this.store.recordFailure(selectedMonth, result, error instanceof Error ? error.message : 'unknown');
      throw error;
    }
  }

  private unwrap(
    result: PromiseSettledResult<TickTickTask[]>,
    call: string,
    successfulCalls: string[],
    failedCalls: Array<{ call: string; reason: string }>,
  ): TickTickTask[] {
    if (result.status === 'fulfilled') {
      successfulCalls.push(call);
      return result.value;
    }
    failedCalls.push({ call, reason: failureReason(result.reason) });
    return [];
  }
}
