export type TaskStatus = 'open' | 'completed' | 'abandoned' | 'unknown';

export interface TickTickProject {
  id: string;
  name: string;
  color?: string;
  closed?: boolean;
  groupId?: string;
  viewMode?: string;
  permission?: string;
  kind?: string;
}

export interface TickTickTag {
  name: string;
  label?: string;
  color?: string;
  parent?: string;
}

export interface TickTickColumn {
  id: string;
  projectId: string;
  name: string;
  sortOrder?: number;
}

export interface TickTickTask {
  id: string;
  projectId: string;
  title: string;
  content?: string;
  desc?: string;
  isAllDay?: boolean;
  startDate?: string;
  dueDate?: string;
  timeZone?: string;
  priority: number;
  status: number;
  completedTime?: string;
  tags?: string[];
  kind?: string;
}

export interface TickTickProjectData {
  project: TickTickProject;
  tasks: TickTickTask[];
  columns: TickTickColumn[];
}

export interface TaskFilter {
  projectIds?: string[];
  startDate?: string;
  endDate?: string;
  priority?: number[];
  tag?: string[];
  status?: number[];
}

export interface NormalizedTask {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  content?: string;
  tags: string[];
  status: TaskStatus;
  startAt?: string;
  dueAt?: string;
  completedAt?: string;
  timeZone?: string;
  isAllDay: boolean;
  localStartDate?: string;
  localDueDate?: string;
}

export interface SyncCoverage {
  status: 'complete' | 'partial' | 'unknown';
  selectedMonth: string;
  projectIds: string[];
  successfulCalls: string[];
  failedCalls: Array<{ call: string; reason: string }>;
  openTaskCount: number;
  completedTaskCount: number;
  unknownTaskCount: number;
}

export interface SyncSnapshot {
  schemaVersion: 2;
  selectedMonth: string;
  generatedAt: string;
  coverage: SyncCoverage;
  tasks: NormalizedTask[];
}

export interface TagProgress {
  tagKey: string;
  displayName: string;
  completed: number;
  open: number;
  total: number;
  percent: number;
  visibleStartDay?: number;
  visibleEndDay?: number;
  clippedBeforeMonth: boolean;
  clippedAfterMonth: boolean;
  hasUnscheduledTasks: boolean;
  unscheduledCount: number;
  lastCompletedAt?: string;
  taskIds: string[];
}
