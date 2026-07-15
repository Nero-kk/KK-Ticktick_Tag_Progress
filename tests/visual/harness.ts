import '../../styles.css';
import type { NormalizedTask, TagProgress } from '../../src/api/contracts';
import { renderDashboard } from '../../src/ui/dashboard-renderer';

const params = new URLSearchParams(location.search);
const month = params.get('month') ?? '2026-07';
if (params.get('theme') === 'dark') document.body.classList.add('theme-dark');
const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

const rows: TagProgress[] = [
  { tagKey: 'unios8k', displayName: 'UNIOS8K', completed: 60, open: 20, total: 80, percent: 75, visibleStartDay: 1, visibleEndDay: Math.min(10, monthDays), clippedBeforeMonth: false, clippedAfterMonth: false, hasUnscheduledTasks: true, unscheduledCount: 2, taskIds: ['t1', 't2'] },
  { tagKey: 'uni610h', displayName: 'UNI610H', completed: 40, open: 45, total: 85, percent: 47.1, visibleStartDay: 1, visibleEndDay: Math.min(15, monthDays), clippedBeforeMonth: true, clippedAfterMonth: false, hasUnscheduledTasks: false, unscheduledCount: 0, taskIds: ['t3'] },
  { tagKey: 'uni650a', displayName: 'UNI650A', completed: 100, open: 0, total: 100, percent: 100, visibleStartDay: 3, visibleEndDay: Math.min(24, monthDays), clippedBeforeMonth: false, clippedAfterMonth: false, hasUnscheduledTasks: false, unscheduledCount: 0, taskIds: ['t4'] },
];

const tasks: NormalizedTask[] = [
  { id: 't1', projectId: 'p1', projectName: 'UNIOS8K', title: 'MAIN FRAME 도면 검토', tags: ['UNIOS8K'], status: 'open', startAt: `${month}-01`, dueAt: `${month}-10`, isAllDay: true, localStartDate: `${month}-01`, localDueDate: `${month}-10` },
  { id: 't2', projectId: 'p1', projectName: 'UNIOS8K', title: 'IFB 간섭 확인', tags: ['UNIOS8K'], status: 'completed', completedAt: `${month}-12`, isAllDay: true },
  { id: 't3', projectId: 'p2', projectName: 'UNI610H', title: 'POWER RACK 조립 검토', tags: ['UNI610H'], status: 'open', startAt: `${month}-01`, dueAt: `${month}-15`, isAllDay: true, localStartDate: `${month}-01`, localDueDate: `${month}-15` },
  { id: 't4', projectId: 'p3', projectName: 'UNI650A', title: '최종 승인', tags: ['UNI650A'], status: 'completed', startAt: `${month}-03`, dueAt: `${month}-24`, isAllDay: true, localStartDate: `${month}-03`, localDueDate: `${month}-24` },
];

renderDashboard(document.querySelector<HTMLElement>('#app')!, {
  month,
  status: 'complete',
  lastSuccessAt: '2026-07-14T05:32:00Z',
  uniqueTaskCount: 265,
  selectedTagKey: 'unios8k',
  summary: {
    activeProjectCount: 6, taskTotal: 265, taskCompleted: 200, untaggedCount: 3,
    unscheduledCount: 2, unknownStatusCount: 0, snapshotAgeMs: 5 * 3_600_000, stale: false,
  },
  rows,
  tasks,
}, {
  onMonthChange: () => undefined,
  onSync: () => undefined,
  onSelectTag: () => undefined,
  onRequestComplete: () => undefined,
  onOpenTask: () => undefined,
  onOpenBases: () => undefined,
  onOpenHub: () => undefined,
});
