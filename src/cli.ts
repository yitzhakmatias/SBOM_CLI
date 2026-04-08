#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'fs';
import { loadStore, saveStore, addDocument } from './db';
import { parseSBOM } from './parser';
import { queryByComponent, queryByLicense } from './query';

const program = new Command();

program
  .name('sbom-cli')
  .description('Ingest and query Software Bill of Materials (SBOMs)')
  .version('1.0.0', '-V, --app-version');

// ── ingest ───────────────────────────────────────────────────────────────────

program
  .command('ingest <file>')
  .description('Parse and store an SBOM file (CycloneDX 1.6 or SPDX 2.3/3.0 JSON)')
  .action((file: string) => {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      console.error(`Error: cannot read file "${file}"`);
      process.exit(1);
    }

    try {
      const doc = parseSBOM(file, content);
      const store = loadStore();
      const op = addDocument(store, doc);
      saveStore(store);
      const n = doc.components.length;
      console.log(
        `${op === 'updated' ? 'Updated' : 'Ingested'}: ${doc.filename} ` +
        `(${doc.format}, ${n} component${n !== 1 ? 's' : ''})`
      );
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

// ── query ─────────────────────────────────────────────────────────────────────

program
  .command('query')
  .description('Query ingested SBOMs by component or license')
  .option('--component <name>', 'component name to search for')
  .option('--version <version>', 'filter by version (requires --component)')
  .option('--license <license>', 'license identifier to search for')
  .action((opts: { component?: string; version?: string; license?: string }) => {
    if (!opts.component && !opts.license) {
      console.error('Error: provide --component <name> or --license <license>');
      process.exit(1);
    }
    if (opts.version && !opts.component) {
      console.error('Error: --version requires --component');
      process.exit(1);
    }

    const store = loadStore();

    if (opts.component) {
      const results = queryByComponent(store, opts.component, opts.version);
      if (!results.length) {
        console.log('No matches found.');
        return;
      }
      for (const r of results) {
        const ver = r.version ?? 'unknown';
        const lic = r.licenses.length ? r.licenses.join(', ') : 'none';
        console.log(`[${r.document}] ${r.component}@${ver}  licenses: ${lic}`);
      }
      return;
    }

    if (opts.license) {
      const results = queryByLicense(store, opts.license);
      if (!results.length) {
        console.log('No matches found.');
        return;
      }
      for (const r of results) {
        const ver = r.version ?? 'unknown';
        console.log(`[${r.document}] ${r.component}@${ver}`);
      }
    }
  });

program.parse(process.argv);
