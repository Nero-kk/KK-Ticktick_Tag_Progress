import type {
  SyncSnapshot,
  TaskFilter,
  TickTickProject,
  TickTickProjectData,
  TickTickTag,
  TickTickTask,
} from '../api/contracts';
import { TickTickHttpError } from '../api/errors';
import { systemTimeZone, toLocalDate } from './local-date';
import { normalizeTask } from './normalizer';
import { clampTaskToMonth, getQueryRange } from './period';
import { SnapshotStore } from './snapshot-store';

export interface SyncApi {
  getProjects(): Promise<TickTickProject[]>;
  getTags(): Promise<TickTickTag[]>;
  getProjectData(projectId: string): Promise<TickTickProjectData>;
  filterTasks(filter: TaskFilter): Promise<TickTickTask[]>;
  getCompletedTasks(filter: Pick<TaskFilter, 'projectIds' | 'startDate' | 'endDate'>): Promise<TickTickTask[]>;
}

export class SyncService {
  private inFlight: Promise<SyncSnapshot> | null = null;

  constructor(private readonly api: SyncApi, private readonly store: SnapshotStore) {}

  sync(selectedMonth: string): Promise<SyncSnapshot> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.performSync(selectedMonth).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async performSync(selectedMonth: string): Promise<SyncSnapshot> {
    try {
      const [projects] = await Promise.all([this.api.getProjects(), this.api.getTags()]);
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
          successfulCalls: ['project', 'tag', ...projectIds.map((id) => `project/${id}/data`), 'task/filter', 'task/completed'],
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
