import fs from 'fs';
import path from 'path';
import { parseSBOM } from '../src/parser';

const fix = (name: string) => path.join(__dirname, '..', 'fixtures', name);
const read = (name: string) => fs.readFileSync(fix(name), 'utf-8');

// ── CycloneDX 1.6 ────────────────────────────────────────────────────────────

describe('parseSBOM — CycloneDX 1.6', () => {
  const doc = parseSBOM(fix('cyclonedx.json'), read('cyclonedx.json'));

  it('detects format as cyclonedx', () => {
    expect(doc.format).toBe('cyclonedx');
  });

  it('parses correct number of components', () => {
    expect(doc.components).toHaveLength(4);
  });

  it('extracts component name and version', () => {
    const express = doc.components.find(c => c.name === 'express');
    expect(express).toBeDefined();
    expect(express?.version).toBe('4.18.2');
  });

  it('extracts MIT license', () => {
    const express = doc.components.find(c => c.name === 'express');
    expect(express?.licenses).toContain('MIT');
  });

  it('extracts GPL license', () => {
    const gpl = doc.components.find(c => c.name === 'some-gpl-lib');
    expect(gpl?.licenses).toContain('GPL-2.0-only');
  });

  it('assigns a unique id', () => {
    const doc2 = parseSBOM(fix('cyclonedx.json'), read('cyclonedx.json'));
    expect(doc.id).not.toBe(doc2.id);
  });
});

// ── SPDX 2.3 ─────────────────────────────────────────────────────────────────

describe('parseSBOM — SPDX 2.3', () => {
  const doc = parseSBOM(fix('spdx.json'), read('spdx.json'));

  it('detects format as spdx', () => {
    expect(doc.format).toBe('spdx');
  });

  it('parses correct number of packages', () => {
    expect(doc.components).toHaveLength(4);
  });

  it('extracts name and versionInfo', () => {
    const react = doc.components.find(c => c.name === 'react');
    expect(react).toBeDefined();
    expect(react?.version).toBe('18.2.0');
  });

  it('extracts licenseConcluded (deduplicates identical declared license)', () => {
    const react = doc.components.find(c => c.name === 'react');
    expect(react?.licenses).toEqual(['MIT']);
  });

  it('extracts GPL license', () => {
    const gpl = doc.components.find(c => c.name === 'some-gpl-lib');
    expect(gpl?.licenses).toContain('GPL-2.0-only');
  });

  it('ignores NOASSERTION and NONE values', () => {
    const noAssertion = `{
      "spdxVersion": "SPDX-2.3",
      "SPDXID": "SPDXRef-DOCUMENT",
      "name": "test",
      "packages": [{
        "SPDXID": "SPDXRef-pkg",
        "name": "pkg",
        "versionInfo": "1.0.0",
        "licenseConcluded": "NOASSERTION",
        "licenseDeclared": "NONE"
      }]
    }`;
    const d = parseSBOM('test.json', noAssertion);
    expect(d.components[0].licenses).toHaveLength(0);
  });
});

// ── SPDX 3.0 JSON-LD ─────────────────────────────────────────────────────────

describe('parseSBOM — SPDX 3.0 JSON-LD', () => {
  const doc = parseSBOM(fix('spdx3.json'), read('spdx3.json'));

  it('detects format as spdx', () => {
    expect(doc.format).toBe('spdx');
  });

  it('parses packages from @graph', () => {
    expect(doc.components).toHaveLength(2);
  });

  it('extracts software_packageVersion', () => {
    const ts = doc.components.find(c => c.name === 'typescript');
    expect(ts?.version).toBe('5.4.0');
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('parseSBOM — error cases', () => {
  it('throws on invalid JSON', () => {
    expect(() => parseSBOM('bad.json', 'not json')).toThrow('Invalid JSON');
  });

  it('throws on unrecognised format', () => {
    expect(() => parseSBOM('unknown.json', '{"foo":"bar"}')).toThrow(
      'Unrecognised SBOM format'
    );
  });
});
