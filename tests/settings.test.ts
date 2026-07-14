import { describe, expect, it } from 'vitest';
import * as settingsModel from '../src/settings-model';

const { loadSettings } = settingsModel;

describe('loadSettings', () => {
  it('stores only a SecretStorage name and never imports token-like keys', () => {
    const settings = loadSettings({ secretName: 'ticktick-progress-api-token', token: 'leak', access_token: 'leak-2' });
    expect(settings.secretName).toBe('ticktick-progress-api-token');
    expect(settings).not.toHaveProperty('token');
    expect(settings).not.toHaveProperty('access_token');
  });

  it('normalizes tag filters and falls back safely for malformed settings', () => {
    expect(loadSettings({ includeTags: [' A ', '', 3], excludeTags: 'bad', showUntagged: 'yes' })).toMatchObject({
      includeTags: ['A'], excludeTags: [], showUntagged: false,
    });
  });

  it('rejects a login email as a SecretStorage ID', () => {
    expect(loadSettings({ secretName: 'kjwl0902@gmail.com' }).secretName).toBe('ticktick-progress-api-token');
  });

  it('stores a pasted API token under the fixed plugin secret ID', () => {
    const store = (settingsModel as typeof settingsModel & {
      storeTickTickAccessToken?: (storage: { setSecret(id: string, value: string): void }, raw: string) => string;
    }).storeTickTickAccessToken;
    expect(store).toBeTypeOf('function');
    const calls: Array<[string, string]> = [];
    expect(store?.({ setSecret: (id, value) => calls.push([id, value]) }, '  Bearer api-token-value  '))
      .toBe('ticktick-progress-api-token');
    expect(calls).toEqual([['ticktick-progress-api-token', 'api-token-value']]);
  });

  it('rejects account credentials in the API token field', () => {
    const store = (settingsModel as typeof settingsModel & {
      storeTickTickAccessToken?: (storage: { setSecret(id: string, value: string): void }, raw: string) => string;
    }).storeTickTickAccessToken;
    expect(() => store?.({ setSecret: () => undefined }, 'kjwl0902@gmail.com')).toThrow(/API token/i);
    expect(() => store?.({ setSecret: () => undefined }, '   ')).toThrow(/API token/i);
  });
});
