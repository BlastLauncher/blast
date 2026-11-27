---
id: "0205"
title: Alfred decision record, plist parser, and archive extractor
status: doing
milestone: M21
depends: []
---

## Goal

Record the architecture for first-class Alfred workflow compatibility in
`docs/decisions/0021-alfred-workflows.md` and create the zero-dependency
`@blastlauncher/alfred` package (`packages/alfred/`) with a pure-TypeScript
XML + binary (`bplist00`) plist parser and safe `.alfredworkflow` ZIP archive
extractor.

## Context

- Issue: `BlastLauncher/blast#47` (Alfred workflow compatibility).
- Existing architecture and constraints: `AGENTS.md`, `docs/architecture.md`,
  `docs/decisions/0001-process-and-scene-model.md`,
  `docs/decisions/0010-pluggable-native-capabilities.md`,
  `docs/decisions/0014-thin-embedders.md`.
- Workspace packages live under `packages/<name>/` (`"private": true`,
  `"type": "module"`, `"exports"` pointing at `./src/*.ts`). Product code must
  run on Node.js 24 without a build step (erasable TypeScript only, explicit
  `.ts` extensions in relative imports).
- Decision `docs/decisions/0021-alfred-workflows.md` (must be ≤ 60 lines per
  `scripts/check-workflow.ts`) must record:
  1. First-class engine support via a dedicated `@blastlauncher/alfred` package:
     `openExtension` will accept unpacked Alfred workflow directories
     (`info.plist`) and `.alfredworkflow` ZIP archives alongside Raycast
     extensions.
  2. Dedicated Node child runtime (`@blastlauncher/alfred/main`) speaking
     Blast's existing protocol v1 NDJSON wire (`init`/`ready`/`scene`/
     `scene.patch`/`event`/`capability.request`/`shutdown`), preserving
     decision 0001 process isolation with no breaking changes to protocol v1,
     embedder protocol 2, or embedders.
  3. Workflow scripts run as child processes of the Alfred runtime with
     standard `alfred_*` environment variables, workflow variables,
     `userconfigurationconfig` mapped to Blast preferences, and process-group
     cleanup on cancel or shutdown.
  4. Privileged OS actions (`output.clipboard`, `action.openurl`,
     `action.openfile`, `action.revealfile`, `{clipboard}`) use Blast's
     deny-by-default capability broker; UI objects render as standard Blast
     `SceneNode` trees.
  5. Compatibility is measured against real Alfred workflows, never claimed;
     unsupported or macOS-only objects fail cleanly without crashing the host.
- `packages/alfred/package.json`:
  - `"name": "@blastlauncher/alfred"`, `"private": true`, `"type": "module"`,
    `"exports": { ".": "./src/index.ts" }`, zero external npm dependencies
    (Node built-ins only). Run `bun install` after creating it so `bun.lock`
    registers the workspace package, then confirm `bun install --frozen-lockfile`.
- `packages/alfred/src/plist.ts`:
  - Export `PlistValue` (`string | number | boolean | Date | Uint8Array | PlistValue[] | { [key: string]: PlistValue }`)
    and `parsePlist(input: string | Uint8Array): PlistValue`.
  - Auto-detect binary (`bplist00` header) vs XML (UTF-8 string or bytes with
    optional BOM).
  - XML plist support: `<plist>`, `<dict>`, `<key>`, `<array>`, `<string>`,
    `<integer>`, `<real>`, `<true/>`, `<false/>`, `<date>`, `<data>` (base64),
    XML comments, DOCTYPE, CDATA, self-closing empty tags (`<string/>`,
    `<dict/>`, `<array/>`, `<data/>`), and XML entities (`&amp;`, `&lt;`,
    `&gt;`, `&quot;`, `&apos;`, decimal `&#NNN;` and hex `&#xHHH;` including
    astral code points).
  - Binary `bplist00` support: 32-byte trailer validation, offset table, object
    markers for null/bool (`0x0`), big-endian int (`0x1`, 8-byte signed),
    float32/float64 real (`0x2`), Apple-epoch date (`0x3`, 2001-01-01T00:00:00Z),
    data (`0x4`), ASCII string (`0x5`), UTF-16BE string (`0x6`), UID (`0x8`),
    array (`0xA`), set (`0xC`), dict (`0xD`). Enforce bounds checks and
    cycle/depth protection; reject malformed input with descriptive errors.
- `packages/alfred/src/archive.ts`:
  - Export `ZipEntry`, `readZipEntries(bytes: Uint8Array): ZipEntry[]`, and
    `extractWorkflowArchive(archivePath: string, cacheRoot: string, options?: { maxTotalBytes?: number; maxEntries?: number }): Promise<{ dir: string; extracted: boolean }>`.
  - Pure-TS ZIP reader using `node:zlib` (`inflateRawSync`): locates End of
    Central Directory (handling comments), parses Central Directory and Local
    File Headers, supports stored (0) and deflate (8), verifies CRC32, skips
    `__MACOSX/` entries, and rejects encrypted entries, unsupported compression,
    symlinks (`((externalAttr >>> 16) & 0o170000) === 0o120000`), path
    traversal (`..`, leading `/`, backslashes, drive prefixes, NUL bytes), and
    zip bombs (default limits: 256 MiB decompressed, 10,000 entries).
  - Preserves POSIX executable bits from ZIP external attributes (`chmod` on
    extracted files when Unix mode has execute bits, e.g. `0o755`) so workflow
    `scriptfile` executables remain runnable.
  - Content-hashed atomic extraction into `<cacheRoot>/<sha256-16>/`: uses a
    temp sibling directory + completion marker (`.blast-extracted`) + atomic
    rename; repeated calls on the same archive return `{ dir, extracted: false }`
    without rewriting; concurrent extraction handles `EEXIST`/`ENOTEMPTY`
    gracefully.
- `packages/alfred/src/index.ts` re-exports `plist.ts` and `archive.ts`.

## Acceptance

- [x] `docs/decisions/0021-alfred-workflows.md` exists, is ≤ 60 lines, and passes `bun run check:workflow`.
- [x] `packages/alfred/package.json` exists with zero external dependencies and `bun.lock` is updated cleanly (`bun install --frozen-lockfile` succeeds).
- [x] `packages/alfred/src/plist.test.ts` tests XML plist parsing (all types, entities, CDATA, comments, self-closing tags, realistic Alfred `info.plist`), binary `bplist00` parsing (all marker types, dates, UTF-16BE, nested containers), and malformed/cyclic rejection.
- [x] `packages/alfred/src/archive.test.ts` tests stored and deflated ZIP entries, executable bit preservation, CRC32 mismatch rejection, path traversal and symlink rejection, zip-bomb limits, `__MACOSX/` skipping, and idempotent atomic extraction.
- [x] `node -e 'import("./packages/alfred/src/index.ts").then(m => { if (!m.parsePlist || !m.extractWorkflowArchive) process.exit(1); })'` exits 0 on Node 24 without a build step.
- [x] `bun run verify` passes.

## Out of scope

- Workflow IR, `ExtensionManifest` mapping, or Script Filter output parsing (Task 0206).
- Script execution, graph execution, or protocol runtime (Tasks 0207–0208).
- Modifying `packages/host`, `packages/cli`, `packages/serve`, `packages/tui`, or `scripts/release/build.ts` (Task 0209).

## Handoff

```
Branch/commit: t3/alfred-foundation @ 9f57bc2f (implementation; Handoff committed on top)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 42.4s — 1365 pass, 1 skip, 0 fail
Done:
- docs/decisions/0021-alfred-workflows.md (54 lines) records the five required decisions; docs/architecture.md package table lists packages/alfred.
- New zero-dependency @blastlauncher/alfred workspace package (bun.lock updated; `bun install --frozen-lockfile` clean); index.ts re-exports plist and archive.
- plist.ts: parsePlist auto-detects bplist00 vs XML (string or bytes, BOM stripped). XML: all value types, entities incl. astral refs, CDATA, comments, DOCTYPE with internal subset, self-closing tags, line/column errors. Binary: trailer/offset-table validation, all listed markers (UID → { CF$UID }, set → array, 16-byte ints), bounds checks, cycle detection, depth limit 512, per-ref memoisation so shared-subtree DAGs cannot blow up.
- archive.ts: readZipEntries (EOCD behind comments, CD + local header cross-check, stored/deflate, CRC-32, maxOutputLength-capped inflate) rejecting encryption, other methods, ZIP64, multi-disk, duplicates, symlinks, unsafe names; extractWorkflowArchive with 256 MiB / 10,000-entry defaults, __MACOSX skip, exec-bit chmod, content-hashed temp dir + .blast-extracted + atomic rename, race-safe.
- 65 tests (plist.test.ts 40, archive.test.ts 25) with in-test bplist and ZIP writers; Node 24 import check exits 0.
Not done / risks:
- Binary null (0x00) and fill markers throw: PlistValue has no null. Integers outside the safe range throw instead of losing precision.
- Memoised binary objects are shared by reference when the plist reuses a ref; callers must not mutate results expecting independent copies.
- Names are decoded as UTF-8 regardless of the ZIP UTF-8 flag (CP437 names decode lossily). Names with "." or empty segments are rejected (strict).
- Execute bits are honoured only for Unix (3) and macOS (19) "made by" hosts; symlink mode is rejected whatever the host. Setuid/setgid/sticky are dropped.
- A leftover cache dir without the marker is deleted and replaced; stray `.<hash>-*` temp dirs from a crashed process are not garbage-collected.
```
