import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TickTickTagProgressPlugin from '../main';
import { renderDashboard } from './dashboard-renderer';

export const DASHBOARD_VIEW_TYPE = 'ticktick-tag-progress-dashboard';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function offsetMonth(month: string, offset: number): string {
  const [yearText, monthText] = month.split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export class GanttDashboardView extends ItemView {
  private month = currentMonth();
  private selectedTagKey: string | undefined;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TickTickTagProgressPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return DASHBOARD_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'TickTick 태그 진행률';
  }

  getIcon(): string {
    return 'chart-gantt';
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  render(): void {
    renderDashboard(this.contentEl, this.plugin.getDashboardModel(this.month, this.selectedTagKey), {
      onMonthChange: (offset) => {
        this.month = offsetMonth(this.month, offset);
        this.selectedTagKey = undefined;
        this.render();
      },
      onSync: () => { void this.plugin.syncMonth(this.month); },
      onSelectTag: (tagKey) => {
        this.selectedTagKey = tagKey;
        this.render();
      },
      onRequestComplete: (taskId) => { this.plugin.requestTaskCompletion(this.month, taskId); },
      onOpenTask: (taskId, newPane) => { void this.plugin.openTaskNote(this.month, taskId, newPane); },
      onOpenBases: (tagKey) => { void this.plugin.openProjectsBase(tagKey); },
      onOpenHub: (tagKey) => { void this.plugin.openProjectHub(tagKey); },
    });
  }
}
