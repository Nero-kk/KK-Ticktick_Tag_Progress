function key(value: string): string {
  return value.normalize('NFKC').trim().toUpperCase();
}

function equivalentKeys(value: string): Set<string> {
  const normalized = key(value);
  const candidates = new Set([normalized]);
  const uni = /^UNI(.+)$/.exec(normalized);
  if (uni?.[1]) {
    candidates.add(`U${uni[1]}`);
    candidates.add(uni[1]);
  }
  const shortU = /^U(.+)$/.exec(normalized);
  if (shortU?.[1]) {
    candidates.add(`UNI${shortU[1]}`);
    candidates.add(shortU[1]);
  }
  if (!normalized.startsWith('U')) {
    candidates.add(`U${normalized}`);
    candidates.add(`UNI${normalized}`);
  }
  return candidates;
}

export function resolveCanonicalProject(
  projectName: string,
  canonicalFolders: string[],
  explicitAliases: Record<string, string>,
): string | null {
  const folders = new Map(canonicalFolders.map((folder) => [key(folder), folder]));
  const direct = folders.get(key(projectName));
  if (direct) return direct;
  const aliasTarget = Object.entries(explicitAliases).find(([alias]) => key(alias) === key(projectName))?.[1];
  if (aliasTarget) return folders.get(key(aliasTarget)) ?? null;
  const inputKeys = equivalentKeys(projectName);
  const matches = canonicalFolders.filter((folder) => {
    const folderKeys = equivalentKeys(folder);
    return [...inputKeys].some((candidate) => folderKeys.has(candidate));
  });
  return matches.length === 1 ? matches[0] ?? null : null;
}
