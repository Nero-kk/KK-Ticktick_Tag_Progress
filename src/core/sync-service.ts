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
  filterTasks(filter: TaskFilter): Promise<TickTickTask[]>;
  getCompletedTasks(filter: Pick<TaskFilter, 'projectIds' | 'startDate' | 'endDate'>): Promise<TickTickTask[]>;
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
      const [projectData, filtered, completed] = await Promise.all([
        Promise.all(projectIds.map((id) => this.api.getProjectData(id))),
        this.api.filterTasks({ projectIds, ...queryRange, status: [0, 2] }),
        this.api.getCompletedTasks({ projectIds, ...queryRange }),
      ]);
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
      const allRaw = [...filtered, ...completed, ...projectData.flatMap((data) => data.tasks)];
      for (const raw of allRaw) {
        if (raw?.id && !rawById.has(raw.id) && inScope(raw)) rawById.set(raw.id, raw);
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
          status: 'complete', selectedMonth, projectIds,
          successfulCalls: ['project', ...projectIds.map((id) => `project/${id}/data`), 'task/filter', 'task/completed'],
          failedCalls: [],
          openTaskCount: tasks.filter((task) => task.status === 'open').length,
          completedTaskCount: tasks.filter((task) => task.status === 'completed').length,
        },
        tasks,
      };
      this.store.accept(snapshot);
      return snapshot;
    } catch (error) {
      const result = error instanceof TickTickHttpError ? error.kind : 'network';
      this.store.recordFailure(selectedMonth, result, error instanceof Error ? error.message : 'unknown');
      throw error;
    }
  }
}
