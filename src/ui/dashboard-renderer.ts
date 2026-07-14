import type { NormalizedTask, TagProgress } from '../api/contracts';
import { daysInMonth } from '../core/period';
import { UNTAGGED_KEY } from '../core/tag-progress-aggregator';

export interface DashboardSummary {
  activeProjectCount: number;
  taskTotal: number;
  taskCompleted: number;
  untaggedCount: number;
  unscheduledCount: number;
  unknownStatusCount: number;
  snapshotAgeMs: number;
  stale: boolean;
}

export interface DashboardModel {
  month: string;
  status: 'empty' | 'syncing' | 'complete' | 'partial' | 'stale' | 'auth' | 'contract';
  lastSuccessAt?: string;
  uniqueTaskCount: number;
  selectedTagKey?: string;
  summary?: DashboardSummary;
  hubPathsByTag?: Record<string, string>;
  rows: TagProgress[];
  tasks: NormalizedTask[];
}

export interface DashboardActions {
  onMonthChange(offset: number): void;
  onSync(): void;
  onSelectTag(tagKey: string): void;
  onRequestComplete(taskId: string): void;
  onOpenTask(taskId: string, newPane: boolean): void;
  onOpenBases(tagKey?: string): void;
  onOpenHub(tagKey: string): void;
}

const STAGNATION_DAYS = 7;

function daysSince(iso: string | undefined, now: number = Date.now()): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(text: string, label = text): HTMLButtonElement {
  const el = element('button', 'ttgp-button', text);
  el.type = 'button';
  el.setAttribute('aria-label', label);
  return el;
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-');
  return `${year}년 ${Number(monthNumber)}월`;
}

function renderToolbar(root: HTMLElement, model: DashboardModel, actions: DashboardActions): void {
  const toolbar = element('header', 'ttgp-toolbar');
  const monthNav = element('div', 'ttgp-month-nav');
  const prev = button('‹', '이전 달');
  prev.addEventListener('click', () => actions.onMonthChange(-1));
  const month = element('strong', 'ttgp-month-title', formatMonth(model.month));
  const next = button('›', '다음 달');
  next.addEventListener('click', () => actions.onMonthChange(1));
  monthNav.append(prev, month, next);

  const meta = element('div', 'ttgp-toolbar-meta');
  const statusLabels: Partial<Record<DashboardModel['status'], string>> = {
    complete: '전체 조회', partial: '부분 조회', stale: '오래됨', syncing: '동기화 중', empty: '데이터 없음',
  };
  const status = element('span', `ttgp-status ttgp-status--${model.status}`, statusLabels[model.status] ?? model.status);
  const count = element('span', 'ttgp-count', `일정 태스크 ${model.uniqueTaskCount}`);
  const synced = element('span', 'ttgp-last-sync', model.lastSuccessAt ? `마지막 성공 ${new Date(model.lastSuccessAt).toLocaleString('ko-KR')}` : '동기화 기록 없음');
  meta.append(status, count, synced);
  const sync = button(model.status === 'syncing' ? '동기화 중…' : '동기화', 'TickTick 수동 동기화');
  sync.classList.add('ttgp-button--sync');
  sync.disabled = model.status === 'syncing';
  sync.addEventListener('click', actions.onSync);
  toolbar.append(monthNav, meta, sync);
  root.append(toolbar);
}

function formatAge(ageMs: number): string {
  if (!Number.isFinite(ageMs) || ageMs < 0) return '시각 불명';
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function renderSummary(root: HTMLElement, summary: DashboardSummary): void {
  const strip = element('section', 'ttgp-summary');
  strip.setAttribute('aria-label', '월간 요약');
  const metric = (label: string, value: string, extraClass?: string): HTMLElement => {
    const item = element('span', `ttgp-summary-item${extraClass ? ` ${extraClass}` : ''}`);
    item.append(element('strong', 'ttgp-summary-value', value), element('span', 'ttgp-summary-label', label));
    return item;
  };
  strip.append(
    metric('활성 프로젝트', String(summary.activeProjectCount)),
    metric('태스크', `${summary.taskCompleted}/${summary.taskTotal}`),
    metric('미분류', String(summary.untaggedCount), summary.untaggedCount > 0 ? 'is-flagged' : undefined),
    metric('기간 미지정', String(summary.unscheduledCount), summary.unscheduledCount > 0 ? 'is-flagged' : undefined),
  );
  if (summary.unknownStatusCount > 0) {
    strip.append(metric('상태 미확정', String(summary.unknownStatusCount), 'is-warning'));
  }
  const freshness = element('span', `ttgp-summary-freshness${summary.stale ? ' is-stale' : ''}`);
  freshness.append(element('span', 'ttgp-summary-label', '데이터'), element('strong', 'ttgp-summary-value', formatAge(summary.snapshotAgeMs)));
  if (summary.stale) freshness.append(element('span', 'ttgp-summary-badge', '동기화 필요'));
  strip.append(freshness);
  root.append(strip);
}

function renderHeader(root: HTMLElement, month: string): void {
  const header = element('div', 'ttgp-grid-header');
  const tag = element('div', 'ttgp-heading ttgp-heading--tag', '태그');
  tag.dataset.column = 'tag';
  const progress = element('div', 'ttgp-heading ttgp-heading--progress', '태스크 완료율');
  progress.dataset.column = 'progress';
  const timeline = element('div', 'ttgp-timeline-header');
  timeline.dataset.column = 'timeline';
  timeline.style.setProperty('--tt-days', String(daysInMonth(month)));
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    const dayEl = element('span', 'ttgp-day', String(day));
    const date = new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00`);
    if (date.getDay() === 0 || date.getDay() === 6) dayEl.classList.add('is-weekend');
    timeline.append(dayEl);
  }
  header.append(tag, progress, timeline);
  root.append(header);
}

function renderRows(root: HTMLElement, model: DashboardModel, actions: DashboardActions): void {
  const rows = element('div', 'ttgp-rows');
  const dayCount = daysInMonth(model.month);
  for (const [index, row] of model.rows.entries()) {
    const selected = row.tagKey === model.selectedTagKey;
    // Visually separate the untagged "기타" group from the project rows above it.
    const startsUntaggedGroup = row.tagKey === UNTAGGED_KEY && index > 0;
    const rowEl = element('div', `ttgp-row${selected ? ' is-selected' : ''}${startsUntaggedGroup ? ' ttgp-row--untagged-group' : ''}`);
    rowEl.setAttribute('role', 'button');
    rowEl.tabIndex = 0;
    rowEl.setAttribute('aria-expanded', String(selected));
    rowEl.setAttribute('aria-label', `${row.displayName}, ${row.completed}/${row.total}, ${row.percent}%`);
    const select = () => actions.onSelectTag(row.tagKey);
    rowEl.addEventListener('click', select);
    rowEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select();
      }
    });

    const tag = element('div', 'ttgp-tag-cell');
    tag.append(element('span', 'ttgp-tag-mark'), element('strong', 'ttgp-tag-name', row.displayName));
    if (row.unscheduledCount > 0) tag.append(element('span', 'ttgp-unscheduled', `+${row.unscheduledCount} 기간 미지정`));
    const hubPath = model.hubPathsByTag?.[row.tagKey];
    if (hubPath) {
      const hub = button('Hub', `${row.displayName} Project Hub 열기`);
      hub.classList.add('ttgp-hub-link');
      hub.addEventListener('click', (event) => { event.stopPropagation(); actions.onOpenHub(row.tagKey); });
      tag.append(hub);
    }
    const progress = element('div', 'ttgp-progress-cell');
    progress.append(element('strong', 'ttgp-fraction', `${row.completed}/${row.total}`), element('span', 'ttgp-percent', `${row.percent}%`));
    if (row.total > 0) {
      const days = daysSince(row.lastCompletedAt);
      const stagnation = element('span', 'ttgp-last-completed', days === null ? '이번 달 완료 없음' : `마지막 완료 ${days}일 전`);
      if (days !== null && days >= STAGNATION_DAYS) stagnation.classList.add('is-stale');
      progress.append(stagnation);
    }
    const timeline = element('div', 'ttgp-timeline-cell');
    timeline.style.setProperty('--tt-days', String(dayCount));
    if (row.total === 0 || row.visibleStartDay === undefined || row.visibleEndDay === undefined) {
      timeline.append(element('span', 'ttgp-no-schedule', '기간 미지정'));
    } else {
      const track = element('div', 'ttgp-track');
      track.style.gridColumn = `${row.visibleStartDay} / ${row.visibleEndDay + 1}`;
      const done = element('span', 'ttgp-segment ttgp-segment--done');
      done.style.width = `${row.percent}%`;
      const open = element('span', 'ttgp-segment ttgp-segment--open');
      open.style.width = `${100 - row.percent}%`;
      track.title = `${row.displayName}: 완료 ${row.completed}, 미완료 ${row.open}, 전체 ${row.total}`;
      track.append(done, open);
      timeline.append(track);
    }
    rowEl.append(tag, progress, timeline);
    rows.append(rowEl);
  }
  root.append(rows);
}

function renderDrilldown(root: HTMLElement, model: DashboardModel, actions: DashboardActions): void {
  if (!model.selectedTagKey) return;
  const selectedRow = model.rows.find((row) => row.tagKey === model.selectedTagKey);
  if (!selectedRow) return;
  const taskIds = new Set(selectedRow.taskIds);
  const tasks = model.tasks.filter((task) => taskIds.has(task.id));
  const panel = element('section', 'ttgp-drilldown');
  const header = element('div', 'ttgp-drilldown-header');
  const title = element('div');
  title.append(element('span', 'ttgp-eyebrow', 'SELECTED TAG'), element('h3', undefined, `${selectedRow.displayName} 태스크`));
  const bases = button('Bases 전체 노트에서 열기', `${selectedRow.displayName}의 생성된 노트를 Bases에서 열기`);
  bases.classList.add('ttgp-button--bases');
  bases.addEventListener('click', () => actions.onOpenBases(selectedRow.tagKey));
  header.append(title, bases);
  const list = element('ul', 'ttgp-task-list');
  for (const task of tasks) {
    const item = element('li', 'ttgp-task');
    const completed = task.status === 'completed';
    const state = element('button', `ttgp-task-toggle ttgp-task-toggle--${task.status}`, completed ? '✓' : '');
    state.type = 'button';
    state.setAttribute('role', 'checkbox');
    state.setAttribute('aria-checked', String(completed));
    state.setAttribute('aria-label', completed ? `${task.title}, 완료됨` : `${task.title}, TickTick에서 완료 처리`);
    state.title = completed ? '완료된 태스크' : 'TickTick에서 완료 처리';
    state.disabled = completed;
    if (!completed) state.addEventListener('click', () => actions.onRequestComplete(task.id));
    const detail = element('button', 'ttgp-task-open');
    detail.type = 'button';
    detail.setAttribute('aria-label', `${task.title} 노트 생성 또는 열기`);
    detail.title = '태스크 노트 생성 또는 열기';
    detail.append(element('strong', undefined, task.title), element('span', undefined, task.localDueDate ?? '기간 미지정'));
    detail.addEventListener('click', (event) => actions.onOpenTask(task.id, event.ctrlKey || event.metaKey));
    item.append(state, detail);
    list.append(item);
  }
  panel.append(header, list);
  root.append(panel);
}

export function renderDashboard(root: HTMLElement, model: DashboardModel, actions: DashboardActions): void {
  root.replaceChildren();
  root.classList.add('ttgp-dashboard');
  renderToolbar(root, model, actions);
  if (model.summary) renderSummary(root, model.summary);
  if (model.status === 'empty' && model.rows.length === 0) {
    root.append(element('div', 'ttgp-empty', '이 월 데이터가 없습니다. 동기화를 실행하세요.'));
    return;
  }
  const board = element('section', 'ttgp-board');
  board.setAttribute('aria-label', `${formatMonth(model.month)} 태그별 진행률`);
  renderHeader(board, model.month);
  renderRows(board, model, actions);
  root.append(board);
  renderDrilldown(root, model, actions);
}
