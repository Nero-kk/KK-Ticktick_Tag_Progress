import { describe, expect, it } from 'vitest';
import { TickTickEndpointGuard } from '../src/api/endpoint-guard';

describe('TickTickEndpointGuard', () => {
  const guard = new TickTickEndpointGuard();

  it.each([
    ['GET', '/project'],
    ['GET', '/tag'],
    ['GET', '/project/abc123/data'],
    ['GET', '/project/abc123/task/task987'],
    ['POST', '/task/completed'],
    ['POST', '/task/filter'],
    ['POST', '/project/abc123/task/task987/complete'],
  ])('allows %s %s', (method, path) => {
    expect(() => guard.assertAllowed(method, path)).not.toThrow();
  });

  it.each([
    ['POST', '/task'],
    ['POST', '/task/task987'],
    ['POST', '/project/abc123/task/task987'],
    ['POST', '/task/move'],
    ['DELETE', '/project/abc123/task/task987'],
    ['GET', '/habit'],
  ])('rejects %s %s', (method, path) => {
    expect(() => guard.assertAllowed(method, path)).toThrow(/endpoint guard/i);
  });
});
