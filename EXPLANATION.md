# SBOM CLI — Explanation Document

## 1. Design Decisions

### CLI Design

I used **Commander.js** as the CLI framework because it is the de-facto standard for Node.js CLIs: it handles argument parsing, flag validation, help text generation, and subcommand routing with minimal boilerplate. The two commands map directly to the exercise spec:

- `sbom-cli ingest <file>` — accepts a positional file path argument.
- `sbom-cli query` — uses `--component`, `--version`, and `--license` flags, where `--version` is only valid in combination with `--component`.

Error cases (missing flags, unreadable file, unrecognised format) exit with code 1 and a descriptive message so the tool is scriptable.

### Database Choice

I chose a **JSON file at `~/.sbom-cli/db.json`** as the backing store. On each invocation the file is read into memory, operated on as a plain JavaScript object, and written back. This satisfies the "in-memory" requirement from the exercise while also persisting data across CLI calls — without it, `ingest` and `query` could never be separate commands.

**Tradeoffs:**

| Aspect | JSON file | SQLite (alternative) |
|---|---|---|
| Dependencies | None (stdlib only) | `better-sqlite3` or similar |
| Query speed | O(n) full scan | Indexed lookups |
| Concurrent writes | Unsafe (no locking) | Safe (WAL mode) |
| Portability | Single file, human-readable | Binary file |
| Setup | Zero config | Zero config (embedded) |

For the scope of this exercise (tens of SBOMs, hundreds of components) the JSON approach is entirely sufficient. SQLite would be the natural next step if query performance or concurrent access became a concern.

### Format Parsing

Format is detected from the JSON content, not the file extension, because SBOM files in the wild rarely have standardised naming:

- **CycloneDX 1.6** is identified by `bomFormat: "CycloneDX"`.
- **SPDX 2.3** is identified by a top-level `spdxVersion` string.
- **SPDX 3.0 JSON-LD** is identified by a `@graph` array whose elements carry a `@type` containing `"Package"`.

The internal data model (`SBOMDocument` / `Component`) is format-agnostic — both parsers normalise their output into the same structure, keeping the query logic simple and format-independent.

### Query Matching

- **Component name** — case-insensitive exact match. A substring match would produce false positives (e.g. `express` matching `express-validator`).
- **Version** — exact match. SBOM version strings are free-form and not reliably semver-comparable.
- **License** — case-insensitive partial match. This lets users query `GPL` and match `GPL-2.0-only`, `GPL-3.0-or-later`, etc., which is the most useful behaviour for a license audit workflow.

### TypeScript

TypeScript was chosen over plain JavaScript for two reasons: (1) the SBOM JSON structures are loosely typed and having explicit interfaces (`Component`, `SBOMDocument`, `Store`) catches shape mismatches at compile time; (2) strict null checks prevent a whole class of runtime errors when parsing optional fields like `version` or `licenses`.

---

## 2. Scaling for Thousands of SBOMs with Millions of Components

The current flat-file approach does not scale beyond a few hundred documents. Here is how I would evolve it:

### Storage — move to SQLite or PostgreSQL

Replace the JSON file with a relational store. A minimal schema:

```sql
CREATE TABLE documents (
  id        TEXT PRIMARY KEY,
  filename  TEXT UNIQUE NOT NULL,
  format    TEXT NOT NULL
);

CREATE TABLE components (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id),
  name        TEXT NOT NULL,
  version     TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE licenses (
  component_id TEXT NOT NULL REFERENCES components(id),
  license      TEXT NOT NULL
);

CREATE INDEX idx_components_name    ON components(name);
CREATE INDEX idx_components_version ON components(version);
CREATE INDEX idx_licenses_license   ON licenses(license);
```

With indexes, `query --component X --version Y` becomes a single indexed lookup instead of a full scan. SQLite handles this well up to tens of millions of rows on a single machine. For larger scale, move to PostgreSQL.

### Ingestion — streaming and batching

Large SBOMs (hundreds of thousands of components) should not be parsed and inserted in a single synchronous operation. Ingestion should:

1. Stream-parse the JSON using a library like `stream-json` to avoid loading the whole file into memory.
2. Batch INSERT components in transactions of ~1,000 rows at a time for throughput.
3. Run ingestion workers in parallel if processing a directory of SBOMs.

### Query — full-text search

For license queries, `LIKE '%GPL%'` on a large table is slow. Options:

- Add a trigram index (`pg_trgm` in PostgreSQL) for substring license matching.
- Or normalise licenses to SPDX identifiers on ingestion and query with an exact index lookup.

### API layer (optional)

If multiple users or CI pipelines need to query the same SBOM database, wrap the store in a lightweight HTTP API (e.g. Express or Fastify). The CLI becomes a thin client that calls the API, enabling centralised storage and access control.

### Summary of scaling path

| Scale | Approach |
|---|---|
| < 1,000 SBOMs | JSON file (current) |
| 1,000 – 100,000 SBOMs | SQLite with indexes |
| 100,000+ SBOMs / multi-user | PostgreSQL + HTTP API + background ingestion workers |

---

## 3. Limitations Imposed by the 1-Hour Time Constraint

- **SPDX 3.0 license graph not fully parsed.** In SPDX 3.0, licenses are separate elements in the `@graph` linked to packages via relationships. The current parser only reads `licenseConcluded` / `licenseDeclared` fields (SPDX 2.x style). Full SPDX 3.0 license support would require traversing the relationship graph, which was out of scope.

- **No concurrent write safety.** Simultaneous `ingest` calls on the same `db.json` file could produce a corrupted store. A file lock (e.g. `proper-lockfile`) or a database with transaction support would prevent this.

- **No input validation beyond format detection.** Malformed SBOMs that pass JSON parsing but have unexpected shapes (e.g. missing `name` fields, non-array `components`) are silently skipped rather than reported. Production code would emit warnings.

- **No pagination.** Query results are printed in full. For large result sets a `--limit` / `--offset` flag would be needed.

- **No component substring search.** Only exact (case-insensitive) name matches are supported. A `--contains` flag would be useful.

- **No `list` command.** There is no way to see all ingested documents without inspecting `~/.sbom-cli/db.json` directly. A `sbom-cli list` command would improve usability.

- **No deduplication of components within a document.** If an SBOM lists the same component twice (which is technically invalid but occurs in practice), both entries are stored and returned.

---

## 4. Evaluation of AI Tools Used

### Tool used

**Claude Code (Anthropic, claude-sonnet-4-6)** — an AI-powered CLI tool that can read, write, and edit files; search codebases; run shell commands; and generate code from natural language descriptions.

---

### What went well

**Rapid project scaffolding.** The full project structure — `package.json`, `tsconfig.json`, `jest.config.js`, all four source modules, three test files, three fixture files, and this README — was generated and written to disk in a single session. What would normally take 20–30 minutes of boilerplate setup was done in under 5 minutes.

**Format coverage.** When asked to support both CycloneDX 1.6 and SPDX 2.3/3.0, Claude correctly identified the structural differences between the formats (top-level `bomFormat` vs `spdxVersion` vs `@graph`) without requiring additional prompting. The detection logic it produced handles all three variants in the test suite.

**Test quality.** The generated tests covered not just happy paths but also edge cases: case-insensitive matching, `NOASSERTION`/`NONE` license values, version mismatch returning empty, partial license matching, and error cases (invalid JSON, unrecognised format). 33 tests pass out of the box without any manual corrections.

**Type safety.** The generated TypeScript is strict (`noImplicitAny`, full null checks) and uses explicit interfaces throughout, which is more rigorous than many human-written first drafts under time pressure.

**Iterative refinement.** When asked to add a README and explanation document, Claude incorporated the design context from the earlier implementation steps without needing to be re-briefed.

---

### Challenges and unsuccessful aspects

**Git identity not pre-configured.** When attempting to create the initial commit, Claude ran into a `fatal: unable to auto-detect email address` error because the local machine had no global `user.name` / `user.email` set. Claude correctly identified the cause and asked the user to configure it, but could not resolve it autonomously since it requires user-specific information.

**SPDX 3.0 license resolution is incomplete.** Claude noted this limitation itself. SPDX 3.0 uses a graph of linked elements for license representation, and fully parsing that graph would require understanding the relationship structure. Claude produced a working parser for the package/version fields but deferred the license graph traversal, correctly flagging it as a known limitation rather than silently producing wrong results.

**No live format validation.** Claude generated test fixtures that are structurally correct but are not validated against the official CycloneDX or SPDX JSON schemas. In a production setting, schema validation on ingest would be valuable, and Claude did not include it unprompted.

---

### Overall assessment

Claude Code was highly effective for the core implementation task: it produced correct, well-structured, tested TypeScript code significantly faster than writing from scratch. It was most valuable for boilerplate-heavy tasks (project setup, test scaffolding, README generation) and for navigating the structural differences between SBOM formats. Its limitations showed at the edges of the domain — deep SPDX 3.0 spec knowledge and environment-specific configuration — where human oversight remained necessary.
