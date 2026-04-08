import path from 'path';
import { randomUUID } from 'crypto';
import { Component, SBOMDocument } from './db';

type RawJSON = Record<string, unknown>;

// ── Public entry point ───────────────────────────────────────────────────────

export function parseSBOM(filePath: string, content: string): SBOMDocument {
  let json: RawJSON;
  try {
    json = JSON.parse(content) as RawJSON;
  } catch {
    throw new Error('Invalid JSON: could not parse SBOM file');
  }

  const filename = path.basename(filePath);
  const id = randomUUID();

  if (isCycloneDX(json)) return parseCycloneDX(id, filename, json);
  if (isSPDX(json)) return parseSPDX(id, filename, json);

  throw new Error(
    'Unrecognised SBOM format. Expected CycloneDX (bomFormat: "CycloneDX") ' +
    'or SPDX (spdxVersion field, or @graph containing software_Package elements).'
  );
}

// ── Format detection ─────────────────────────────────────────────────────────

function isCycloneDX(json: RawJSON): boolean {
  return json['bomFormat'] === 'CycloneDX';
}

function isSPDX(json: RawJSON): boolean {
  // SPDX 2.x has a top-level spdxVersion string
  if (typeof json['spdxVersion'] === 'string') return true;
  // SPDX 3.0 JSON-LD uses @graph
  if (Array.isArray(json['@graph'])) {
    return (json['@graph'] as RawJSON[]).some(e =>
      String(e['@type'] ?? '').includes('Package')
    );
  }
  return false;
}

// ── CycloneDX 1.6 ────────────────────────────────────────────────────────────

function parseCycloneDX(id: string, filename: string, json: RawJSON): SBOMDocument {
  const raw = (json['components'] as RawJSON[] | undefined) ?? [];
  const components: Component[] = raw
    .map(c => ({
      name: String(c['name'] ?? ''),
      version: c['version'] !== undefined ? String(c['version']) : undefined,
      licenses: extractCycloneDXLicenses(c['licenses']),
    }))
    .filter(c => c.name);

  return { id, filename, format: 'cyclonedx', components };
}

function extractCycloneDXLicenses(licenses: unknown): string[] {
  if (!Array.isArray(licenses)) return [];
  const result: string[] = [];
  for (const l of licenses as RawJSON[]) {
    const lic = l['license'] as RawJSON | undefined;
    if (lic?.['id']) result.push(String(lic['id']));
    else if (lic?.['name']) result.push(String(lic['name']));
    if (l['expression']) result.push(String(l['expression']));
  }
  return result;
}

// ── SPDX 2.x / 3.0 ──────────────────────────────────────────────────────────

function parseSPDX(id: string, filename: string, json: RawJSON): SBOMDocument {
  // SPDX 3.0 JSON-LD uses @graph; SPDX 2.x uses a top-level packages array
  const rawPackages: RawJSON[] = Array.isArray(json['@graph'])
    ? (json['@graph'] as RawJSON[]).filter(e =>
        String(e['@type'] ?? '').includes('Package') ||
        String(e['type'] ?? '').includes('Package')
      )
    : ((json['packages'] as RawJSON[] | undefined) ?? []);

  const components: Component[] = rawPackages
    .map(p => ({
      name: String(p['name'] ?? ''),
      // SPDX 2.x: versionInfo  |  SPDX 3.0: software_packageVersion
      version:
        p['versionInfo'] !== undefined
          ? String(p['versionInfo'])
          : p['software_packageVersion'] !== undefined
          ? String(p['software_packageVersion'])
          : undefined,
      licenses: extractSPDXLicenses(p),
    }))
    .filter(c => c.name);

  return { id, filename, format: 'spdx', components };
}

function extractSPDXLicenses(pkg: RawJSON): string[] {
  const SKIP = new Set(['NOASSERTION', 'NONE', '']);
  const result: string[] = [];
  for (const field of ['licenseConcluded', 'licenseDeclared']) {
    const val = pkg[field];
    if (typeof val === 'string' && !SKIP.has(val)) result.push(val);
  }
  return [...new Set(result)];
}
