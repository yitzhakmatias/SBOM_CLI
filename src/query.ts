import { Store } from './db';

export interface ComponentMatch {
  document: string;
  component: string;
  version?: string;
  licenses: string[];
}

export interface LicenseMatch {
  document: string;
  component: string;
  version?: string;
}

export function queryByComponent(
  store: Store,
  name: string,
  version?: string
): ComponentMatch[] {
  const results: ComponentMatch[] = [];
  const needle = name.toLowerCase();

  for (const doc of store.documents) {
    for (const comp of doc.components) {
      const nameMatch = comp.name.toLowerCase() === needle;
      const versionMatch = version === undefined || comp.version === version;
      if (nameMatch && versionMatch) {
        results.push({
          document: doc.filename,
          component: comp.name,
          version: comp.version,
          licenses: comp.licenses,
        });
      }
    }
  }

  return results;
}

export function queryByLicense(store: Store, license: string): LicenseMatch[] {
  const results: LicenseMatch[] = [];
  const needle = license.toLowerCase();

  for (const doc of store.documents) {
    for (const comp of doc.components) {
      if (comp.licenses.some(l => l.toLowerCase().includes(needle))) {
        results.push({
          document: doc.filename,
          component: comp.name,
          version: comp.version,
        });
      }
    }
  }

  return results;
}
