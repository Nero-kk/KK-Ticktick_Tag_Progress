import { describe, expect, it } from 'vitest';
import { addTickTickView } from '../src/bases/projects-base-integrator';
import { parse } from 'yaml';

const base = `filters:\n  or:\n    - 'type == "project-hub"'\n    - 'type == "generated-cache"'\n\nproperties:\n  project:\n    displayName: 프로젝트\n\nviews:\n  - type: table\n    name: Active Projects\n    order:\n      - project\n`;

describe('addTickTickView', () => {
  it('adds the task-note root filter and one named view while preserving existing views', () => {
    const patched = addTickTickView(base);
    const parsed = parse(patched) as { filters: { or: string[] }; properties: Record<string, unknown>; views: Array<{ name: string }> };
    expect(parsed.filters.or).toContain('type == "ticktick-task-note"');
    expect(parsed.properties).toHaveProperty('ticktickProject');
    expect(parsed.views.map((view) => view.name)).toEqual(['Active Projects', 'TickTick Task Notes']);
  });

  it('is idempotent', () => {
    const once = addTickTickView(base);
    expect(addTickTickView(once)).toBe(once);
  });

  it('recognizes an existing connection after Bases removes YAML quotes', () => {
    const serialized = addTickTickView(base).replace(/- 'type == ([^']+)'/g, '- type == $1');
    expect(addTickTickView(serialized)).toBe(serialized);
  });

  it('patches an unquoted root filter emitted by Bases', () => {
    const serialized = base.replace(`- 'type == "generated-cache"'`, `- type == "generated-cache"`);
    const patched = addTickTickView(serialized);
    const parsed = parse(patched) as { filters: { or: string[] }; views: Array<{ name: string }> };
    expect(parsed.filters.or).toContain('type == "ticktick-task-note"');
    expect(parsed.views.map((view) => view.name)).toContain('TickTick Task Notes');
  });

  it('fails closed when expected anchors are absent', () => {
    expect(() => addTickTickView('views: []\n')).toThrow(/root filter/i);
  });
});
