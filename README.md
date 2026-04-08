# sbom-cli

A command-line tool for ingesting and querying **Software Bill of Materials (SBOMs)**. It supports both [CycloneDX 1.6](https://cyclonedx.org/specification/overview/) and [SPDX 2.3 / 3.0](https://spdx.dev/) JSON formats, stores data in a lightweight local JSON database, and lets you search across all ingested SBOMs by component name, version, or license.

---

## Table of Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Building](#building)
- [Usage](#usage)
  - [ingest](#ingest)
  - [query by component](#query-by-component)
  - [query by license](#query-by-license)
- [Examples](#examples)
- [Running Tests](#running-tests)
- [Project Structure](#project-structure)
- [Design Decisions](#design-decisions)
- [Limitations](#limitations)

---

## Requirements

- Node.js >= 18
- npm >= 9

---

## Installation

```bash
git clone <your-repo-url>
cd sbom-cli
npm install
```

---

## Building

Compile TypeScript to JavaScript in `dist/`:

```bash
npm run build
```

After building you can run the CLI directly:

```bash
node dist/cli.js <command>
```

Or link it globally so `sbom-cli` works as a standalone command:

```bash
npm link
sbom-cli <command>
```

To run without building (useful during development):

```bash
npx ts-node src/cli.ts <command>
```

---

## Usage

### ingest

Parse an SBOM file and store it in the local database.

```
sbom-cli ingest <file>
```

| Argument | Description |
|---|---|
| `<file>` | Path to a JSON SBOM file (CycloneDX 1.6 or SPDX 2.3/3.0) |

- The format is auto-detected from the file content.
- Ingesting the same filename a second time **replaces** the previous entry.
- Data is stored in `~/.sbom-cli/db.json`.

---

### query by component

Find all ingested documents that contain a specific component, optionally filtered by version.

```
sbom-cli query --component <name> [--version <version>]
```

| Flag | Description |
|---|---|
| `--component <name>` | Component name to search for (case-insensitive) |
| `--version <version>` | Optional exact version to match |

---

### query by license

Find all components across all ingested documents that carry a specific license.

```
sbom-cli query --license <license>
```

| Flag | Description |
|---|---|
| `--license <license>` | License identifier to search for (case-insensitive, partial match) |

---

## Examples

```bash
# Ingest a CycloneDX SBOM
sbom-cli ingest ./fixtures/cyclonedx.json
# → Ingested: cyclonedx.json (cyclonedx, 4 components)

# Ingest an SPDX SBOM
sbom-cli ingest ./fixtures/spdx.json
# → Ingested: spdx.json (spdx, 4 components)

# Find all documents that include "lodash"
sbom-cli query --component lodash
# → [cyclonedx.json] lodash@4.17.21  licenses: MIT
# → [spdx.json] lodash@4.17.21  licenses: MIT

# Find "lodash" at a specific version
sbom-cli query --component lodash --version 4.17.21
# → [cyclonedx.json] lodash@4.17.21  licenses: MIT
# → [spdx.json] lodash@4.17.21  licenses: MIT

# Find all components licensed under GPL
sbom-cli query --license GPL
# → [cyclonedx.json] some-gpl-lib@2.0.0
# → [spdx.json] some-gpl-lib@2.0.0

# Ingesting the same file again updates it in place
sbom-cli ingest ./fixtures/cyclonedx.json
# → Updated: cyclonedx.json (cyclonedx, 4 components)

# No results
sbom-cli query --component nonexistent
# → No matches found.
```

---

## Running Tests

```bash
npm test
```

The test suite covers three modules:

| File | What it tests |
|---|---|
| `tests/parser.test.ts` | CycloneDX 1.6, SPDX 2.3, SPDX 3.0 JSON-LD parsing, error cases |
| `tests/db.test.ts` | Store creation, document add/update/deduplication |
| `tests/query.test.ts` | Component search (with/without version filter), license search, edge cases |

```
Test Suites: 3 passed, 3 total
Tests:       33 passed, 33 total
```

Run in watch mode during development:

```bash
npm run test:watch
```

---

## Project Structure

```
sbom-cli/
├── src/
│   ├── cli.ts        # CLI entry point — Commander commands (ingest, query)
│   ├── db.ts         # In-memory store backed by ~/.sbom-cli/db.json
│   ├── parser.ts     # SBOM format detection and parsing (CycloneDX + SPDX)
│   └── query.ts      # Query logic: by component name/version, by license
├── tests/
│   ├── parser.test.ts
│   ├── db.test.ts
│   └── query.test.ts
├── fixtures/
│   ├── cyclonedx.json   # Sample CycloneDX 1.6 SBOM
│   ├── spdx.json        # Sample SPDX 2.3 SBOM
│   └── spdx3.json       # Sample SPDX 3.0 JSON-LD SBOM
├── package.json
├── tsconfig.json
└── jest.config.js
```

---

## Design Decisions

### Language & runtime
TypeScript on Node.js was chosen for its strong typing (helpful when navigating loosely-structured SBOM JSON), large ecosystem, and fast iteration with `ts-node`.

### Storage
Data is stored as a flat JSON file at `~/.sbom-cli/db.json`. The entire file is loaded into memory on each command, operated on, and written back. This keeps the implementation simple and dependency-free (no database engine required). For the scale of this exercise (tens to hundreds of SBOMs) it is entirely sufficient.

### Format detection
Format is detected from the JSON content rather than the file extension:
- CycloneDX is identified by `bomFormat: "CycloneDX"`.
- SPDX 2.x is identified by a top-level `spdxVersion` string.
- SPDX 3.0 JSON-LD is identified by a `@graph` array whose elements carry a `@type` containing `"Package"`.

### Query matching
- Component name matching is **case-insensitive exact match** — avoids false positives from substring collisions (e.g. `express` vs `express-validator`).
- License matching is **case-insensitive partial match** — allows querying `GPL` to match `GPL-2.0-only`, `GPL-3.0-or-later`, etc.
- Version matching, when provided, is **exact** — SBOM version strings are not semver-comparable in general.

---

## Limitations

The following were deferred given the 1-hour time constraint:

- **No full SPDX 3.0 license support.** SPDX 3.0 represents licenses as separate graph elements linked by relationships. The current parser only reads `licenseConcluded` / `licenseDeclared` fields (SPDX 2.x style). A complete implementation would traverse the `@graph` to resolve license elements.
- **No concurrent write safety.** Parallel `ingest` calls could cause a race condition on `db.json`. A file lock (e.g. `proper-lockfile`) would fix this.
- **No pagination.** Query results are printed in full. A `--limit` / `--offset` flag would improve usability for large result sets.
- **No fuzzy / substring component search.** Component names must match exactly (case-insensitively). A `--contains` flag could be added.
- **Scaling.** For thousands of SBOMs with millions of components, the flat-file approach would need to be replaced with a proper indexed store (e.g. SQLite with indexes on `component_name`, `version`, and `license`), and the CLI would need streaming ingestion rather than loading the full dataset into memory.
