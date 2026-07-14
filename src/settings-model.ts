export interface TickTickTagProgressSettings {
  secretName: string;
  includeTags: string[];
  excludeTags: string[];
  showUntagged: boolean;
  projectAliases: Record<string, string>;
  projectsBasePath: string;
  completionTtlMinutes: number;
}

export const DEFAULT_SETTINGS: TickTickTagProgressSettings = {
  secretName: 'ticktick-progress-api-token',
  includeTags: [],
  excludeTags: [],
  showUntagged: true,
  projectAliases: {},
  projectsBasePath: '90. Settings/Bases/Projects.base',
  completionTtlMinutes: 30,
};

interface SecretWriter {
  setSecret(id: string, value: string): void;
}

function validSecretId(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function storeTickTickAccessToken(storage: SecretWriter, raw: string): string {
  const token = raw.trim().replace(/^Bearer\s+/i, '').trim();
  if (!token || token.includes('@') || /\s/.test(token)) {
    throw new Error('Paste a TickTick API token, not account credentials');
  }
  storage.setSecret(DEFAULT_SETTINGS.secretName, token);
  return DEFAULT_SETTINGS.secretName;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function aliases(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, target]) => [key.trim(), target.trim()])
    .filter(([key, target]) => Boolean(key && target)));
}

export function loadSettings(raw: unknown): TickTickTagProgressSettings {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const secretName = typeof value.secretName === 'string' ? value.secretName.trim() : '';
  return {
    secretName: validSecretId(secretName) ? secretName : DEFAULT_SETTINGS.secretName,
    includeTags: stringArray(value.includeTags),
    excludeTags: stringArray(value.excludeTags),
    showUntagged: Object.prototype.hasOwnProperty.call(value, 'showUntagged')
      ? value.showUntagged === true
      : DEFAULT_SETTINGS.showUntagged,
    projectAliases: aliases(value.projectAliases),
    projectsBasePath: typeof value.projectsBasePath === 'string' && value.projectsBasePath.trim()
      ? value.projectsBasePath.trim()
      : DEFAULT_SETTINGS.projectsBasePath,
    completionTtlMinutes: typeof value.completionTtlMinutes === 'number'
      && Number.isFinite(value.completionTtlMinutes) && value.completionTtlMinutes > 0
      ? value.completionTtlMinutes
      : DEFAULT_SETTINGS.completionTtlMinutes,
  };
}
