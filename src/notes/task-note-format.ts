import type { NormalizedTask } from '../api/contracts';

const START_MARKER = '<!-- ticktick-managed:start -->';
const END_MARKER = '<!-- ticktick-managed:end -->';
const LEGACY_NOTICE = '> 이 노트는 TickTick 태스크의 읽기 전용 미러입니다. 상태 변경은 TickTick에서 하세요.';
const COMPLETION_NOTICE = '> 이 노트는 TickTick 내용을 로컬로 미러링합니다. 완료 처리는 TickTick 태그 진행률 대시보드의 체크 버튼에서 확인 후 수행할 수 있습니다.';

export interface TaskNoteMeta {
  syncedAt: string;
  snapshotAt?: string;
  coverage: 'complete' | 'partial' | 'unknown';
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function sanitizeFileName(title: string, maxLength = 72): string {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, '-').replace(/\s+/g, ' ').trim();
  return (cleaned || '제목 없음').slice(0, maxLength).trim();
}

export function taskNoteFileName(task: NormalizedTask): string {
  return `${sanitizeFileName(task.title)}--${task.id.slice(-8)}.md`;
}

export function buildTaskNote(
  task: NormalizedTask,
  meta: TaskNoteMeta,
): string {
  const tagLines = task.tags.length > 0 ? task.tags.map((tag) => `  - ${yamlString(tag)}`).join('\n') : '  []';
  return `---
type: ticktick-task-note
title: ${yamlString(task.title)}
aliases:
  - ${yamlString(task.title)}
description: ${yamlString('TickTick 태스크와 연결된 로컬 작업 메모')}
created: ${meta.syncedAt.slice(0, 10)}
updated: ${meta.syncedAt.slice(0, 10)}
tags:
  - ticktick-note
ticktickId: ${yamlString(task.id)}
ticktickProjectId: ${yamlString(task.projectId)}
ticktickProject: ${yamlString(task.projectName)}
ticktickTags:
${tagLines}
ticktickStatus: ${task.status}
ticktickStart: ${task.startAt ? yamlString(task.startAt) : ''}
ticktickDue: ${task.dueAt ? yamlString(task.dueAt) : ''}
ticktickCompletedAt: ${task.completedAt ? yamlString(task.completedAt) : ''}
ticktickSyncedAt: ${yamlString(meta.syncedAt)}
ticktickSnapshotAt: ${yamlString(meta.snapshotAt ?? meta.syncedAt)}
ticktickCoverage: ${meta.coverage}
syncMode: completion-write-through
---

# ${task.title}

> [!info] TickTick 연결
${COMPLETION_NOTICE}

${START_MARKER}
## TickTick 내용

${task.content?.trim() || '내용 없음'}
${END_MARKER}

## 작업 메모
`;
}

export function updateManagedBlock(source: string, content: string): string {
  const starts = source.split(START_MARKER).length - 1;
  const ends = source.split(END_MARKER).length - 1;
  if (starts !== 1 || ends !== 1) throw new Error('Managed marker conflict');
  const startIndex = source.indexOf(START_MARKER);
  const endIndex = source.indexOf(END_MARKER);
  if (endIndex < startIndex) throw new Error('Managed marker order conflict');
  const replacement = `${START_MARKER}\n## TickTick 내용\n\n${content.trim() || '내용 없음'}\n${END_MARKER}`;
  const updated = source.slice(0, startIndex) + replacement + source.slice(endIndex + END_MARKER.length);
  return updated.replace(LEGACY_NOTICE, COMPLETION_NOTICE);
}

function setOptional(frontmatter: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value === undefined) delete frontmatter[key];
  else frontmatter[key] = value;
}

export function updateManagedFrontmatter(
  frontmatter: Record<string, unknown>,
  task: NormalizedTask,
  meta: TaskNoteMeta,
): void {
  const aliases = Array.isArray(frontmatter.aliases)
    ? frontmatter.aliases.filter((alias): alias is string => typeof alias === 'string')
    : [];
  if (!aliases.includes(task.title)) aliases.push(task.title);
  frontmatter.title = task.title;
  frontmatter.aliases = aliases;
  frontmatter.updated = meta.syncedAt.slice(0, 10);
  frontmatter.ticktickId = task.id;
  frontmatter.ticktickProjectId = task.projectId;
  frontmatter.ticktickProject = task.projectName;
  frontmatter.ticktickTags = [...task.tags];
  frontmatter.ticktickStatus = task.status;
  setOptional(frontmatter, 'ticktickStart', task.startAt);
  setOptional(frontmatter, 'ticktickDue', task.dueAt);
  setOptional(frontmatter, 'ticktickCompletedAt', task.completedAt);
  frontmatter.ticktickSyncedAt = meta.syncedAt;
  frontmatter.ticktickSnapshotAt = meta.snapshotAt ?? meta.syncedAt;
  frontmatter.ticktickCoverage = meta.coverage;
  frontmatter.syncMode = 'completion-write-through';
}
