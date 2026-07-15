import { describe, expect, it } from 'vitest';
import { toLocalDate } from '../src/core/local-date';

describe('toLocalDate', () => {
  it('advances to the next KST day at the UTC 15:00 boundary', () => {
    expect(toLocalDate('2026-07-14T15:00:00.000+0000', 'Asia/Seoul', false, 'UTC')).toBe('2026-07-15');
  });

  it('stays on the same KST day just before the UTC 15:00 boundary', () => {
    expect(toLocalDate('2026-07-14T14:59:59.000+0000', 'Asia/Seoul', false, 'UTC')).toBe('2026-07-14');
  });

  it('carries a late-June KST instant into July', () => {
    expect(toLocalDate('2026-06-30T15:30:00.000+0000', 'Asia/Seoul', false, 'UTC')).toBe('2026-07-01');
  });

  it('treats all-day tasks as floating calendar dates regardless of time zone', () => {
    expect(toLocalDate('2026-07-01T00:00:00.000+0000', 'America/Los_Angeles', true, 'UTC')).toBe('2026-07-01');
    expect(toLocalDate('2026-07-01T00:00:00.000+0000', undefined, true, 'Asia/Seoul')).toBe('2026-07-01');
  });

  it('falls back to the provided zone when the task time zone is missing or invalid', () => {
    expect(toLocalDate('2026-07-14T15:00:00.000+0000', undefined, false, 'Asia/Seoul')).toBe('2026-07-15');
    expect(toLocalDate('2026-07-14T15:00:00.000+0000', 'Not/AZone', false, 'Asia/Seoul')).toBe('2026-07-15');
  });

  it('returns null for values that are not ISO-shaped', () => {
    expect(toLocalDate('not-a-date', 'Asia/Seoul', false, 'UTC')).toBeNull();
  });

  it('falls back to the date part when the time cannot be parsed', () => {
    expect(toLocalDate('2026-07-14Tgarbage', 'Asia/Seoul', false, 'UTC')).toBe('2026-07-14');
  });
});
