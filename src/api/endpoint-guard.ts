const ALLOWED: ReadonlyArray<{ method: string; path: RegExp }> = [
  { method: 'GET', path: /^\/project$/ },
  { method: 'GET', path: /^\/tag$/ },
  { method: 'GET', path: /^\/project\/[^/]+\/data$/ },
  { method: 'GET', path: /^\/project\/[^/]+\/task\/[^/]+$/ },
  { method: 'POST', path: /^\/task\/completed$/ },
  { method: 'POST', path: /^\/task\/filter$/ },
  { method: 'POST', path: /^\/project\/[^/]+\/task\/[^/]+\/complete$/ },
];

export class TickTickEndpointGuard {
  assertAllowed(method: string, path: string): void {
    const normalizedMethod = method.toUpperCase();
    const safePath = path.split('?')[0] ?? '';
    const allowed = ALLOWED.some((entry) => entry.method === normalizedMethod && entry.path.test(safePath));
    if (!allowed) {
      throw new Error(`TickTick endpoint guard rejected ${normalizedMethod} ${safePath}`);
    }
  }
}
