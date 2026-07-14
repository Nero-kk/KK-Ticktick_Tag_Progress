// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderDashboard } from '../src/ui/dashboard-renderer';
import type { DashboardActions, DashboardModel } from '../src/ui/dashboard-renderer';

const model: DashboardModel = {
  month: '2026-07', status: 'complete', lastSuccessAt: '2026-07-14T05:32:00Z',
  uniqueTaskCount: 80, selectedTagKey: 'unios8k',
  rows: [{ tagKey: 'unios8k', displayName: 'UNIOS8K', completed: 60, open: 20, total: 80, percent: 75, visibleStartDay: 1, visibleEndDay: 10, clippedBeforeMonth: false, clippedAfterMonth: false, hasUnscheduledTasks: false, unscheduledCount: 0, taskIds: ['t1'] }],
  tasks: [{ id: 't1', projectId: 'p', projectName: 'UNIOS8K', title: 'Main frame 검토', tags: ['UNIOS8K'], status: 'open', startAt: '2026-07-01', dueAt: '2026-07-10', isAllDay: true, localStartDate: '2026-07-01', localDueDate: '2026-07-10' }],
};

function actions(overrides: Partial<DashboardActions> = {}): DashboardActions {
  return {
    onMonthChange: vi.fn(),
    onSync: vi.fn(),
    onSelectTag: vi.fn(),
    onRequestComplete: vi.fn(),
    onOpenTask: vi.fn(),
    onOpenBases: vi.fn(),
    ...overrides,
  };
}

describe('renderDashboard', () => {
  it('renders the image-inspired three-column gantt with 31 day labels and a 75% split', () => {
    const root = document.createElement('div');
    renderDashboard(root, model, actions());
    expect(root.querySelector('[data-column="tag"]')?.textContent).toContain('태그');
    expect(root.querySelector('[data-column="progress"]')?.textContent).toContain('완료율');
    expect(root.querySelectorAll('.ttgp-day')).toHaveLength(31);
    expect((root.querySelector('.ttgp-segment--done') as HTMLElement).style.width).toBe('75%');
    expect(root.querySelector('[role="button"][aria-expanded="true"]')).not.toBeNull();
  });

  it('supports keyboard row selection and exposes a truthful Bases fallback label', () => {
    const onSelectTag = vi.fn();
    const root = document.createElement('div');
    renderDashboard(root, model, actions({ onSelectTag }));
    const row = root.querySelector<HTMLElement>('[role="button"]')!;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onSelectTag).toHaveBeenCalledWith('unios8k');
    expect(root.textContent).toContain('Bases 전체 노트에서 열기');
  });

  it('keeps completion and note creation as separate explicit task actions', () => {
    const onRequestComplete = vi.fn();
    const onOpenTask = vi.fn();
    const root = document.createElement('div');
    renderDashboard(root, model, actions({ onRequestComplete, onOpenTask }));

    const toggle = root.querySelector<HTMLButtonElement>('.ttgp-task-toggle')!;
    expect(toggle.getAttribute('role')).toBe('checkbox');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    toggle.click();
    expect(onRequestComplete).toHaveBeenCalledWith('t1');
    expect(onOpenTask).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('.ttgp-task-open')!.click();
    expect(onOpenTask).toHaveBeenCalledWith('t1', false);
  });

  it('renders completed task checkboxes as checked and disabled', () => {
    const root = document.createElement('div');
    const completed: DashboardModel = {
      ...model,
      tasks: [{ ...model.tasks[0]!, status: 'completed' }],
    };
    renderDashboard(root, completed, actions());

    const toggle = root.querySelector<HTMLButtonElement>('.ttgp-task-toggle')!;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.disabled).toBe(true);
  });
});
