import { describe, expect, it } from 'vitest';
import { buildTaskNote, updateManagedBlock, updateManagedFrontmatter } from '../src/notes/task-note-format';
import type { NormalizedTask } from '../src/api/contracts';

const task: NormalizedTask = {
  id: '0123456789abcdef', projectId: 'p1', projectName: 'UNIOS8K', title: 'Main frame 검토',
  content: 'TickTick 본문', tags: ['UNIOS8K'], status: 'open', startAt: '2026-07-01', dueAt: '2026-07-18', isAllDay: true,
};

describe('task note format', () => {
  it('builds a completion-aware mirror with stable identity and a user memo section', () => {
    const note = buildTaskNote(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' });
    expect(note).toContain('type: ticktick-task-note');
    expect(note).toContain('ticktickId: "0123456789abcdef"');
    expect(note).toContain('title: "Main frame 검토"');
    expect(note).toContain('<!-- ticktick-managed:start -->');
    expect(note).toContain('syncMode: completion-write-through');
    expect(note).toContain('완료 처리는 TickTick 태그 진행률 대시보드의 체크 버튼');
    expect(note).toContain('## 작업 메모');
  });

  it('migrates the legacy read-only notice while updating managed content', () => {
    const legacy = buildTaskNote(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' })
      .replace(
        '> 이 노트는 TickTick 내용을 로컬로 미러링합니다. 완료 처리는 TickTick 태그 진행률 대시보드의 체크 버튼에서 확인 후 수행할 수 있습니다.',
        '> 이 노트는 TickTick 태스크의 읽기 전용 미러입니다. 상태 변경은 TickTick에서 하세요.',
      );
    const updated = updateManagedBlock(legacy, '최신 본문');
    expect(updated).not.toContain('상태 변경은 TickTick에서 하세요.');
    expect(updated).toContain('완료 처리는 TickTick 태그 진행률 대시보드의 체크 버튼');
  });

  it('updates only the managed block and preserves the user memo byte-for-byte', () => {
    const original = `${buildTaskNote(task, { syncedAt: '2026-07-14T00:00:00Z', coverage: 'complete' })}\n사용자 메모  A  \n- [ ] 보존`;
    const updated = updateManagedBlock(original, '새 TickTick 본문');
    expect(updated).toContain('새 TickTick 본문');
    expect(updated.endsWith('사용자 메모  A  \n- [ ] 보존')).toBe(true);
  });

  it('fails closed when managed markers are malformed', () => {
    expect(() => updateManagedBlock('<!-- ticktick-managed:start -->\nbroken', 'new')).toThrow(/managed marker/i);
  });

  it('updates only plugin-owned frontmatter while preserving user metadata and title aliases', () => {
    const frontmatter: Record<string, unknown> = {
      type: 'ticktick-task-note', created: '2026-07-14', tags: ['ticktick-note', 'user-tag'],
      aliases: ['이전 제목', '사용자 별칭'], customProperty: 'keep me', ticktickStatus: 'open',
    };
    updateManagedFrontmatter(frontmatter, {
      ...task, title: '새 제목', status: 'completed', dueAt: '2026-07-20',
    }, { syncedAt: '2026-07-15T00:00:00Z', snapshotAt: '2026-07-14T00:00:00Z', coverage: 'complete' });
    expect(frontmatter).toMatchObject({
      created: '2026-07-14', tags: ['ticktick-note', 'user-tag'], customProperty: 'keep me',
      title: '새 제목', aliases: ['이전 제목', '사용자 별칭', '새 제목'],
      ticktickStatus: 'completed', ticktickDue: '2026-07-20', ticktickSnapshotAt: '2026-07-14T00:00:00Z',
      syncMode: 'completion-write-through',
    });
  });
});
