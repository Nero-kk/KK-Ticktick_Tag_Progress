export type TickTickErrorKind = 'auth' | 'rate-limit' | 'server' | 'contract' | 'network';

export class TickTickHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly kind: TickTickErrorKind,
    message = `TickTick API request failed (${status})`,
  ) {
    super(message);
    this.name = 'TickTickHttpError';
  }
}

export function kindForStatus(status: number): TickTickErrorKind {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  return 'contract';
}
