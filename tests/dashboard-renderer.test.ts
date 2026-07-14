// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderDashboard } from '../src/ui/dashboard-renderer';
import type { DashboardActions, DashboardModel } from '../src/ui/dashboard-renderer';

const model: DashboardModel = {
  month: '2026-07', status: 'complete', lastSuccessAt: '2026-07-14T05:32:00Z',
  uniqueTaskCount: 80, selectedTagKey: 'unios8k',
  summary: {
    activeProjectCount: 6, taskTotal: 25, taskCompleted: 11, untaggedCount: 3,
    unscheduledCount: 4, unknownStatusCount: 0, snapshotAgeMs: 5 * 3_600_000, stale: false,
  },
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
    onOpenHub: vi.fn(),
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

  it('renders the portfolio summary strip with exception counts and freshness', () => {
    const root = document.createElement('div');
    renderDashboard(root, model, actions());
    const summary = root.querySelector('.ttgp-summary');
    expect(summary?.textContent).toContain('활성 프로젝트');
    expect(summary?.textContent).toContain('11/25');
    expect(summary?.textContent).toContain('미분류');
    expect(summary?.textContent).toContain('5시간 전');
    expect(root.querySelector('.ttgp-summary-badge')).toBeNull();
  });

  it('flags a stale snapshot with a sync-required badge', () => {
    const root = document.createElement('div');
    const stale = { ...model, summary: { ...model.summary!, snapshotAgeMs: 90 * 60_000, stale: true } };
    renderDashboard(root, stale, actions());
    expect(root.querySelector('.ttgp-summary-badge')?.textContent).toBe('동기화 필요');
    expect(root.querySelector('.ttgp-summary-freshness')?.textContent).toContain('1시간 전');
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

  it('shows a Hub link only for tags with a resolved hub and opens it without selecting the row', () => {
    const onOpenHub = vi.fn();
    const onSelectTag = vi.fn();
    const root = document.createElement('div');
    renderDashboard(root, { ...model, hubPathsByTag: { unios8k: '40. Projects/UNIOS8K/Hub.md' } }, actions({ onOpenHub, onSelectTag }));
    const hub = root.querySelector<HTMLButtonElement>('.ttgp-hub-link')!;
    expect(hub).not.toBeNull();
    hub.click();
    expect(onOpenHub).toHaveBeenCalledWith('unios8k');
    expect(onSelectTag).not.toHaveBeenCalled();
  });

  it('omits the Hub link when no hub is resolved for the tag', () => {
    const root = document.createElement('div');
    renderDashboard(root, { ...model, hubPathsByTag: {} }, actions());
    expect(root.querySelector('.ttgp-hub-link')).toBeNull();
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
