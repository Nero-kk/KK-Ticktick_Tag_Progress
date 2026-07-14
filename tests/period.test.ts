import { describe, expect, it } from 'vitest';
import { clampTaskToMonth, daysInMonth, getMonthRange } from '../src/core/period';

describe('period helpers', () => {
  it.each([
    ['2024-02', 29],
    ['2025-02', 28],
    ['2026-04', 30],
    ['2026-07', 31],
  ])('calculates the number of days in %s', (month, expected) => {
    expect(daysInMonth(month)).toBe(expected);
  });

  it('clamps a span crossing both month boundaries', () => {
    expect(clampTaskToMonth('2026-06-25', '2026-08-03', '2026-07')).toEqual({
      startDay: 1,
      endDay: 31,
      clippedBeforeMonth: true,
      clippedAfterMonth: true,
    });
  });

  it('returns null when a task does not overlap the month', () => {
    expect(clampTaskToMonth('2026-06-01', '2026-06-30', '2026-07')).toBeNull();
  });

  it('returns local ISO month boundaries', () => {
    expect(getMonthRange('2026-07')).toEqual({ startDate: '2026-07-01', endDate: '2026-07-31' });
  });
});
