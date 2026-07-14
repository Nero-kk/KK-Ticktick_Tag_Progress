import { describe, expect, it } from 'vitest';
import { resolveCanonicalProject } from '../src/notes/project-mapper';

describe('resolveCanonicalProject', () => {
  const folders = ['UNIOS8K', 'UNI610H', 'UNI650A'];

  it.each([
    ['UNIOS8K', 'UNIOS8K'], ['UOS8K', 'UNIOS8K'], ['OS8K', 'UNIOS8K'],
    ['UNI610H', 'UNI610H'], ['U610H', 'UNI610H'], ['610H', 'UNI610H'],
  ])('maps only canonical mechanical project forms: %s', (input, expected) => {
    expect(resolveCanonicalProject(input, folders, {})).toBe(expected);
  });

  it('honors an explicit alias', () => {
    expect(resolveCanonicalProject('customer-a', folders, { 'customer-a': 'UNI650A' })).toBe('UNI650A');
  });

  it('does not fuzzy-match a typo', () => {
    expect(resolveCanonicalProject('UNI61OH', folders, {})).toBeNull();
  });
});
