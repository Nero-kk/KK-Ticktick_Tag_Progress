import type {
  TickTickProject,
  TickTickProjectData,
  TickTickTag,
  TickTickTask,
} from './contracts';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertProject(value: unknown): asserts value is TickTickProject {
  const item = record(value);
  if (!item || !nonEmptyString(item.id) || !nonEmptyString(item.name)) throw new Error('Invalid projects response');
}

function assertTask(value: unknown): asserts value is TickTickTask {
  const item = record(value);
  const tagsValid = item?.tags === undefined || (Array.isArray(item.tags) && item.tags.every((tag) => typeof tag === 'string'));
  if (!item || !nonEmptyString(item.id) || !nonEmptyString(item.projectId) || !nonEmptyString(item.title)
    || typeof item.priority !== 'number' || typeof item.status !== 'number' || !tagsValid) {
    throw new Error('Invalid task response');
  }
}

export function parseProjects(value: unknown): TickTickProject[] {
  if (!Array.isArray(value)) throw new Error('Invalid projects response');
  value.forEach(assertProject);
  return value;
}

export function parseTags(value: unknown): TickTickTag[] {
  if (!Array.isArray(value)) throw new Error('Invalid tag response');
  for (const entry of value) {
    const item = record(entry);
    if (!item || !nonEmptyString(item.name)) throw new Error('Invalid tag response');
  }
  return value as TickTickTag[];
}

export function parseTasks(value: unknown): TickTickTask[] {
  if (!Array.isArray(value)) throw new Error('Invalid task response');
  value.forEach(assertTask);
  return value;
}

export function parseTask(value: unknown): TickTickTask {
  assertTask(value);
  return value;
}

export function parseProjectData(value: unknown): TickTickProjectData {
  const item = record(value);
  if (!item || !Array.isArray(item.tasks) || !Array.isArray(item.columns)) throw new Error('Invalid project data response');
  assertProject(item.project);
  item.tasks.forEach(assertTask);
  return item as unknown as TickTickProjectData;
}
