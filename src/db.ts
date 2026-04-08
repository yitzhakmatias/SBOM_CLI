import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Data model ───────────────────────────────────────────────────────────────

export interface Component {
  name: string;
  version?: string;
  licenses: string[];
}

export interface SBOMDocument {
  id: string;
  filename: string;
  format: 'cyclonedx' | 'spdx';
  components: Component[];
}

export interface Store {
  documents: SBOMDocument[];
}

// ── Store operations ─────────────────────────────────────────────────────────

export const DB_PATH = path.join(os.homedir(), '.sbom-cli', 'db.json');

export function createStore(): Store {
  return { documents: [] };
}

export function loadStore(dbPath = DB_PATH): Store {
  try {
    if (fs.existsSync(dbPath)) {
      return JSON.parse(fs.readFileSync(dbPath, 'utf-8')) as Store;
    }
  } catch {
    // corrupted or missing — start fresh
  }
  return createStore();
}

export function saveStore(store: Store, dbPath = DB_PATH): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dbPath, JSON.stringify(store, null, 2), 'utf-8');
}

/** Adds or replaces a document (matched by filename). Returns 'added' or 'updated'. */
export function addDocument(store: Store, doc: SBOMDocument): 'added' | 'updated' {
  const idx = store.documents.findIndex(d => d.filename === doc.filename);
  if (idx >= 0) {
    store.documents[idx] = doc;
    return 'updated';
  }
  store.documents.push(doc);
  return 'added';
}
