const DATE_PREFIX = /^(\d{4}-\d{2}-\d{2})/;

export function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function formatInZone(instant: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

/**
 * Resolves a TickTick timestamp to the calendar date the user sees.
 *
 * All-day tasks carry a floating calendar date, so the date part is used
 * verbatim. Timed tasks carry a UTC instant plus a task time zone, so the
 * instant is projected into that zone (falling back to the system zone) before
 * the date is read. Returns null for values that are not ISO-shaped at all.
 */
export function toLocalDate(
  iso: string,
  timeZone: string | undefined,
  isAllDay: boolean,
  fallbackTimeZone: string,
): string | null {
  const match = DATE_PREFIX.exec(iso);
  if (!match) return null;
  const datePart = match[1]!;
  if (isAllDay) return datePart;
  const instant = Date.parse(iso);
  if (!Number.isFinite(instant)) return datePart;
  const zone = timeZone && isValidTimeZone(timeZone) ? timeZone : fallbackTimeZone;
  return formatInZone(instant, zone);
}
