import { describe, expect, it } from 'vitest';
import { OfficialOpenApiClient } from '../src/api/official-open-api-client';
import type { ApiTransport } from '../src/api/official-open-api-client';

describe('OfficialOpenApiClient', () => {
  it('sends a read-only filter request with bearer authorization', async () => {
    const calls: Parameters<ApiTransport>[0][] = [];
    const transport: ApiTransport = async (request) => {
      calls.push(request);
      return { status: 200, json: [] };
    };
    const client = new OfficialOpenApiClient(() => 'secret-token', transport);
    await client.filterTasks({ projectIds: ['p'], startDate: '2026-07-01', endDate: '2026-07-31', status: [0, 2] });
    expect(calls[0]).toMatchObject({
      url: 'https://api.ticktick.com/open/v1/task/filter', method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
    });
  });

  it('maps authentication failures without including response bodies', async () => {
    const transport: ApiTransport = async () => ({ status: 401, json: { token: 'must-not-leak' } });
    const client = new OfficialOpenApiClient(() => 'token', transport);
    await expect(client.getProjects()).rejects.toEqual(expect.objectContaining({ status: 401, kind: 'auth' }));
    await expect(client.getProjects()).rejects.not.toThrow(/must-not-leak/);
  });

  it('rejects write endpoints even when called through the low-level request surface', async () => {
    const client = new OfficialOpenApiClient(() => 'token', async () => ({ status: 200, json: {} }));
    await expect(client.request('POST', '/task', {})).rejects.toThrow(/endpoint guard/i);
  });

  it('completes exactly one task through the official encoded endpoint', async () => {
    const calls: Parameters<ApiTransport>[0][] = [];
    const client = new OfficialOpenApiClient(() => 'token', async (request) => {
      calls.push(request);
      return { status: 200, json: null };
    });

    await client.completeTask('project id', 'task/id');

    expect(calls).toEqual([expect.objectContaining({
      url: 'https://api.ticktick.com/open/v1/project/project%20id/task/task%2Fid/complete',
      method: 'POST',
    })]);
    expect(calls[0]?.body).toBeUndefined();
  });

  it('retries rate limits without exposing response bodies', async () => {
    let attempts = 0;
    const client = new OfficialOpenApiClient(
      () => 'token',
      async () => ({ status: ++attempts === 1 ? 429 : 200, json: attempts === 1 ? { secret: 'no' } : [] }),
      { sleep: async () => undefined, random: () => 0 },
    );
    await expect(client.getProjects()).resolves.toEqual([]);
    expect(attempts).toBe(2);
  });

  it('classifies malformed successful responses as contract errors', async () => {
    const client = new OfficialOpenApiClient(() => 'token', async () => ({ status: 200, json: { not: 'projects' } }));
    await expect(client.getProjects()).rejects.toEqual(expect.objectContaining({ kind: 'contract' }));
  });

  it('never retries a completion POST and reports an unconfirmed timeout', async () => {
    let attempts = 0;
    const client = new OfficialOpenApiClient(
      () => 'token',
      () => { attempts += 1; return Promise.reject(new Error('boom')); },
      { sleep: async () => undefined, random: () => 0 },
    );
    await expect(client.completeTask('p', 't')).rejects.toEqual(expect.objectContaining({ kind: 'unknown-outcome' }));
    expect(attempts).toBe(1);
  });

  it('treats a 5xx on a completion POST as an unconfirmed outcome without resending', async () => {
    let attempts = 0;
    const client = new OfficialOpenApiClient(() => 'token', async () => { attempts += 1; return { status: 500, json: null }; });
    await expect(client.completeTask('p', 't')).rejects.toEqual(expect.objectContaining({ kind: 'unknown-outcome' }));
    expect(attempts).toBe(1);
  });

  it('maps a 404 completion POST to a definitive not-found', async () => {
    let attempts = 0;
    const client = new OfficialOpenApiClient(() => 'token', async () => { attempts += 1; return { status: 404, json: null }; });
    await expect(client.completeTask('p', 't')).rejects.toEqual(expect.objectContaining({ kind: 'not-found' }));
    expect(attempts).toBe(1);
  });
});
