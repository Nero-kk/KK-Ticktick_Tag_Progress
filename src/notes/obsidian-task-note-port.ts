import { App, getFrontMatterInfo, normalizePath, parseYaml, TFile, TFolder } from 'obsidian';
import type { NormalizedTask } from '../api/contracts';
import { updateManagedBlock, updateManagedFrontmatter, type TaskNoteMeta } from './task-note-format';
import type { TaskNotePort, TaskNoteReference } from './task-note-repository';

export class ObsidianTaskNotePort implements TaskNotePort {
  constructor(
    private readonly app: App,
    private readonly rootFolder = '40. Projects',
    private readonly taskNotesSubfolder = 'TickTick Notes',
  ) {}

  async listTaskNotes(): Promise<TaskNoteReference[]> {
    const notes: TaskNoteReference[] = [];
    const marker = `/${this.taskNotesSubfolder}/`;
    const candidates = this.app.vault.getMarkdownFiles().filter((file) => file.path.includes(marker));
    for (const file of candidates) {
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (frontmatter?.type === 'ticktick-task-note' && typeof frontmatter.ticktickId === 'string') {
        notes.push({ path: file.path, ticktickId: frontmatter.ticktickId });
        continue;
      }
      const info = getFrontMatterInfo(await this.app.vault.read(file));
      if (!info.exists) continue;
      try {
        const parsed = parseYaml(info.frontmatter) as Record<string, unknown> | null;
        if (parsed?.type === 'ticktick-task-note' && typeof parsed.ticktickId === 'string') {
          notes.push({ path: file.path, ticktickId: parsed.ticktickId });
        }
      } catch {
        // Malformed frontmatter is not a safe exact-ID match.
      }
    }
    return notes;
  }

  async listProjectFolders(): Promise<string[]> {
    const projects = this.app.vault.getFolderByPath(this.rootFolder);
    if (!projects) return [];
    return projects.children.filter((child): child is TFolder => child instanceof TFolder).map((folder) => folder.name);
  }

  async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getFolderByPath(normalized)) await this.app.vault.createFolder(normalized);
  }

  async create(path: string, content: string): Promise<string> {
    const normalized = normalizePath(path);
    if (this.app.vault.getAbstractFileByPath(normalized)) throw new Error(`Task note path already exists: ${normalized}`);
    return (await this.app.vault.create(normalized, content)).path;
  }

  async update(
    path: string,
    task: NormalizedTask,
    meta: TaskNoteMeta,
  ): Promise<void> {
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`Task note not found: ${path}`);
    updateManagedBlock(await this.app.vault.read(file), task.content ?? '');
    await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
      updateManagedFrontmatter(frontmatter, task, meta);
    });
    await this.app.vault.process(file, (source) => updateManagedBlock(source, task.content ?? ''));
  }

  async open(path: string, newPane: boolean): Promise<void> {
    const file = this.app.vault.getFileByPath(normalizePath(path));
    if (!(file instanceof TFile)) throw new Error(`Task note not found: ${path}`);
    await this.app.workspace.getLeaf(newPane ? 'tab' : false).openFile(file);
  }
}
