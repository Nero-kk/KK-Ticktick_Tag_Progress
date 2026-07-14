import type { NormalizedTask } from '../api/contracts';
import { resolveCanonicalProject } from './project-mapper';
import { buildTaskNote, taskNoteFileName, type TaskNoteMeta } from './task-note-format';

function resolveTaskProject(
  task: Pick<NormalizedTask, 'projectName' | 'tags'>,
  folders: string[],
  aliases: Record<string, string>,
): string | null {
  const direct = resolveCanonicalProject(task.projectName, folders, aliases);
  if (direct) return direct;

  const tagMatches = new Set(task.tags
    .map((tag) => resolveCanonicalProject(tag, folders, aliases))
    .filter((project): project is string => project !== null));
  if (tagMatches.size > 1) {
    throw new Error(`Ambiguous project tags: ${[...tagMatches].join(', ')}`);
  }
  return tagMatches.values().next().value ?? null;
}

export interface TaskNoteReference {
  path: string;
  ticktickId: string;
}

export interface TaskNotePort {
  listTaskNotes(): Promise<TaskNoteReference[]>;
  listProjectFolders(): Promise<string[]>;
  ensureFolder(path: string): Promise<void>;
  create(path: string, content: string): Promise<string>;
  update(
    path: string,
    task: NormalizedTask,
    meta: TaskNoteMeta,
  ): Promise<void>;
  open(path: string, newPane: boolean): Promise<void>;
}

export interface TaskNoteLayout {
  rootFolder: string;
  taskNotesSubfolder: string;
}

const DEFAULT_LAYOUT: TaskNoteLayout = { rootFolder: '40. Projects', taskNotesSubfolder: 'TickTick Notes' };

export class TaskNoteRepository {
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly port: TaskNotePort,
    private readonly projectAliases: Record<string, string>,
    private readonly layout: TaskNoteLayout = DEFAULT_LAYOUT,
  ) {}

  async openOrCreate(
    task: NormalizedTask,
    meta: TaskNoteMeta,
    newPane: boolean,
  ): Promise<string> {
    let operation = this.inFlight.get(task.id);
    if (!operation) {
      operation = this.upsert(task, meta);
      this.inFlight.set(task.id, operation);
    }
    try {
      const path = await operation;
      await this.port.open(path, newPane);
      return path;
    } finally {
      if (this.inFlight.get(task.id) === operation) this.inFlight.delete(task.id);
    }
  }

  private async upsert(
    task: NormalizedTask,
    meta: TaskNoteMeta,
  ): Promise<string> {
    const matches = (await this.port.listTaskNotes()).filter((note) => note.ticktickId === task.id);
    if (matches.length > 1) throw new Error(`Duplicate TickTick ID: ${task.id}`);
    if (matches[0]) {
      await this.port.update(matches[0].path, task, meta);
      return matches[0].path;
    }
    const folders = await this.port.listProjectFolders();
    const canonicalProject = resolveTaskProject(task, folders, this.projectAliases);
    if (!canonicalProject) {
      throw new Error(`Project mapping not found: ${task.projectName}; tags: ${task.tags.join(', ') || '(none)'}`);
    }
    const folder = `${this.layout.rootFolder}/${canonicalProject}/${this.layout.taskNotesSubfolder}`;
    await this.port.ensureFolder(folder);
    const path = `${folder}/${taskNoteFileName(task)}`;
    try {
      return await this.port.create(path, buildTaskNote(task, meta));
    } catch (error) {
      const recovered = (await this.port.listTaskNotes()).filter((note) => note.ticktickId === task.id);
      if (recovered.length > 1) throw new Error(`Duplicate TickTick ID: ${task.id}`);
      if (!recovered[0]) throw error;
      await this.port.update(recovered[0].path, task, meta);
      return recovered[0].path;
    }
  }
}
