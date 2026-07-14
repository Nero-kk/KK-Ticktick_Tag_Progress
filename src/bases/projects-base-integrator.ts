const ROOT_FILTER_PATTERN = /^([ \t]*-[ \t]+)('?)type == "generated-cache"\2[ \t]*$/m;
const TASK_FILTER_PATTERN = /^[ \t]*-[ \t]+('?)type == "ticktick-task-note"\1[ \t]*$/m;
const TASK_FILTER_VALUE = 'type == "ticktick-task-note"';
const VIEW_NAME = 'TickTick Task Notes';

const PROPERTY_ENTRIES: ReadonlyArray<[string, string]> = [
  ['ticktickProject', 'TickTick 프로젝트'],
  ['ticktickTags', 'TickTick 태그'],
  ['ticktickStatus', 'TickTick 상태'],
  ['ticktickDue', '마감'],
  ['ticktickSnapshotAt', 'Snapshot 시각'],
  ['ticktickCoverage', '조회 범위'],
  ['ticktickSyncedAt', '노트 동기화'],
];

const TICKTICK_VIEW = `

  - type: table
    name: TickTick Task Notes
    filters:
      and:
        - 'type == "ticktick-task-note"'
    order:
      - file.name
      - ticktickProject
      - ticktickTags
      - ticktickStatus
      - ticktickDue
      - ticktickSnapshotAt
      - ticktickCoverage
      - ticktickSyncedAt
    groupBy:
      property: ticktickProject
      direction: ASC
`;

export function addTickTickView(source: string): string {
  const hasProperties = PROPERTY_ENTRIES.every(([key]) => new RegExp(`^  ${key}:`, 'm').test(source));
  const hasTaskFilter = TASK_FILTER_PATTERN.test(source);
  if (source.includes(`name: ${VIEW_NAME}`) && hasTaskFilter && hasProperties) return source;
  const rootFilter = ROOT_FILTER_PATTERN.exec(source);
  if (!rootFilter) throw new Error('Projects.base root filter anchor not found');
  if (!/^views:\s*$/m.test(source)) throw new Error('Projects.base views anchor not found');
  if (!/^properties:\s*$/m.test(source)) throw new Error('Projects.base properties anchor not found');
  const prefix = rootFilter[1] ?? '    - ';
  const quote = rootFilter[2] ?? '';
  let patched = hasTaskFilter
    ? source
    : source.replace(ROOT_FILTER_PATTERN, `${rootFilter[0]}\n${prefix}${quote}${TASK_FILTER_VALUE}${quote}`);
  for (const [key, displayName] of PROPERTY_ENTRIES) {
    if (!new RegExp(`^  ${key}:`, 'm').test(patched)) {
      patched = patched.replace(/^views:\s*$/m, `  ${key}:\n    displayName: ${displayName}\n\nviews:`);
    }
  }
  if (patched.includes(`name: ${VIEW_NAME}`)) return patched;
  return patched.trimEnd() + TICKTICK_VIEW;
}
