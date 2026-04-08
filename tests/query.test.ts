import { createStore, addDocument, Store } from '../src/db';
import { queryByComponent, queryByLicense } from '../src/query';

let store: Store;

beforeEach(() => {
  store = createStore();

  addDocument(store, {
    id: '1',
    filename: 'frontend.json',
    format: 'cyclonedx',
    components: [
      { name: 'react', version: '18.2.0', licenses: ['MIT'] },
      { name: 'lodash', version: '4.17.21', licenses: ['MIT'] },
    ],
  });

  addDocument(store, {
    id: '2',
    filename: 'backend.json',
    format: 'spdx',
    components: [
      { name: 'express', version: '4.18.2', licenses: ['MIT'] },
      { name: 'lodash', version: '4.17.21', licenses: ['MIT'] },
      { name: 'some-gpl-lib', version: '2.0.0', licenses: ['GPL-2.0-only'] },
    ],
  });
});

// ── queryByComponent ──────────────────────────────────────────────────────────

describe('queryByComponent', () => {
  it('finds a component that appears in multiple documents', () => {
    expect(queryByComponent(store, 'lodash')).toHaveLength(2);
  });

  it('is case-insensitive on component name', () => {
    expect(queryByComponent(store, 'REACT')).toHaveLength(1);
    expect(queryByComponent(store, 'React')).toHaveLength(1);
  });

  it('filters by exact version when provided', () => {
    expect(queryByComponent(store, 'lodash', '4.17.21')).toHaveLength(2);
  });

  it('returns empty when version does not match', () => {
    expect(queryByComponent(store, 'lodash', '3.0.0')).toHaveLength(0);
  });

  it('returns empty for an unknown component', () => {
    expect(queryByComponent(store, 'nonexistent')).toHaveLength(0);
  });

  it('includes correct document filename, version, and licenses', () => {
    const [result] = queryByComponent(store, 'react');
    expect(result.document).toBe('frontend.json');
    expect(result.version).toBe('18.2.0');
    expect(result.licenses).toContain('MIT');
  });
});

// ── queryByLicense ────────────────────────────────────────────────────────────

describe('queryByLicense', () => {
  it('finds all components with MIT license across both documents', () => {
    const results = queryByLicense(store, 'MIT');
    // react, lodash (frontend) + express, lodash (backend) = 4
    expect(results).toHaveLength(4);
  });

  it('is case-insensitive on license identifier', () => {
    expect(queryByLicense(store, 'mit')).toHaveLength(4);
  });

  it('matches partial license strings (e.g. "GPL")', () => {
    const results = queryByLicense(store, 'GPL');
    expect(results).toHaveLength(1);
    expect(results[0].component).toBe('some-gpl-lib');
    expect(results[0].document).toBe('backend.json');
  });

  it('returns empty for an unknown license', () => {
    expect(queryByLicense(store, 'Apache-3.0')).toHaveLength(0);
  });

  it('includes correct document and version in result', () => {
    const [result] = queryByLicense(store, 'GPL');
    expect(result.version).toBe('2.0.0');
  });
});
