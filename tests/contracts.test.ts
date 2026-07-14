import { describe, expect, it } from 'vitest';
import { parseProjectData, parseProjects, parseTags, parseTasks } from '../src/api/contract-validator';

describe('official API contract validator', () => {
  it('accepts documented project, tag, project-data, and task shapes', () => {
    expect(parseProjects([{ id: 'p', name: 'P' }])).toHaveLength(1);
    expect(parseTags([{ name: 'UNIOS8K', label: 'UNIOS8K' }])).toHaveLength(1);
    expect(parseProjectData({ project: { id: 'p', name: 'P' }, tasks: [], columns: [] }).project.id).toBe('p');
    expect(parseTasks([{ id: 't', projectId: 'p', title: 'T', priority: 0, status: 0, tags: [] }])[0]?.id).toBe('t');
  });

  it('rejects malformed roots and required fields rather than guessing', () => {
    expect(() => parseProjects({ id: 'p' })).toThrow(/projects/i);
    expect(() => parseTags([{ label: 'missing-name' }])).toThrow(/tag/i);
    expect(() => parseProjectData({ project: { id: 'p', name: 'P' }, tasks: {} })).toThrow(/project data/i);
    expect(() => parseTasks([{ id: '', projectId: 'p', title: 'T', priority: 0, status: 0 }])).toThrow(/task/i);
  });
});
