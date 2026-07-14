export interface ClampedSpan {
  startDay: number;
  endDay: number;
  clippedBeforeMonth: boolean;
  clippedAfterMonth: boolean;
}

function assertMonth(month: string): [number, number] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  if (monthIndex < 1 || monthIndex > 12) throw new Error(`Invalid month: ${month}`);
  return [year, monthIndex];
}

export function daysInMonth(month: string): number {
  const [year, monthIndex] = assertMonth(month);
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
}

export function getMonthRange(month: string): { startDate: string; endDate: string } {
  return { startDate: `${month}-01`, endDate: `${month}-${String(daysInMonth(month)).padStart(2, '0')}` };
}

function datePart(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

function dayNumber(value: string): number | null {
  const date = datePart(value);
  if (!date) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

export function clampTaskToMonth(start: string, due: string, month: string): ClampedSpan | null {
  const startTime = dayNumber(start);
  const dueTime = dayNumber(due);
  if (startTime === null || dueTime === null || startTime > dueTime) return null;
  const range = getMonthRange(month);
  const monthStart = dayNumber(range.startDate)!;
  const monthEnd = dayNumber(range.endDate)!;
  if (dueTime < monthStart || startTime > monthEnd) return null;
  const visibleStart = Math.max(startTime, monthStart);
  const visibleEnd = Math.min(dueTime, monthEnd);
  return {
    startDay: new Date(visibleStart).getUTCDate(),
    endDay: new Date(visibleEnd).getUTCDate(),
    clippedBeforeMonth: startTime < monthStart,
    clippedAfterMonth: dueTime > monthEnd,
  };
}
