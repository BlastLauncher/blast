---
id: "0037"
title: Shared dependency allowlist (interim, until v1)
status: doing
milestone: M3
depends: ["0036"]
---

## Goal

Blast provides one pinned copy of the most-used npm packages to every
extension, the same way it provides `@raycast/utils`, so extensions that
import them bundle instead of failing with `MISSING_DEPENDENCY`.

## Context

- User decision (2026-10-18): interim strategy until the first release. The
  production direction is different — not shipping every package, but a thin
  layer that references the extension repo's own pinned dependencies with
  minimal disk use. Write this down in the decision record so the allowlist is
  not mistaken for the final design.
- Policy lives in `docs/decisions/0002-*.md` (amend it, ≤ 60 lines; Status
  line notes the amendment) and in `dependencyPolicy` in
  `packages/host/src/bundle.ts`. Selection mirrors it in
  `scripts/corpus/selection.ts` (`PROVIDED_DEPENDENCIES`, `PROVIDED_SPECIFIER`)
  — make one exported list in host the single source and use it in both.
- Pick from `compat/dependencies.json` (task 0036; summary and curve in
  `compat/DEPENDENCIES.md`: top 30 → 2205/3443 extensions satisfied) by
  `imported`, roughly the top 20–30. Exclude `run-applescript` and other
  macOS-automation packages (they cannot work outside macOS; record why), with these filters, each reason recorded in the decision or a
  comment next to the list: pure JavaScript (no native addons, no install
  scripts), reasonable install size (`npm view <pkg> dist.unpackedSize`;
  justify anything over 5 MB; total added to `node_modules` ≤ 60 MB measured
  with `du`), not a browser-automation/CLI-binary package. Pin the major most
  extensions declare (from `majors`) at its latest exact version
  (`npm view <pkg>@<major> version`), not blindly `latest`.
- Packages resolve from the host's dependencies and their graphs are bundled
  (same mechanism as utils). Subpath imports (`date-fns/format`, `lodash/get`)
  must work. An extension that declares a different major still gets ours;
  the CLI should print a one-line `# log` warning naming package, declared
  range and provided version when `package.json` disagrees on major.
- Add host bundle tests with small fixture extensions under `fixtures/` that
  import a provided package (default + subpath import) and one unprovided
  package (still `MISSING_DEPENDENCY`).
- Curated selection keeps its rules but now accepts provided packages; do not
  re-run `corpus:select` (changing the curated set is a later task).
- Report in Handoff: the list with versions and sizes, measured `du -sh
  node_modules` before/after, and how many corpus extensions become
  dependency-satisfied according to the 0036 data.

## Acceptance

- [x] One exported provided-package list used by bundler and selection.
- [x] Fixture tests: provided default import, provided subpath import,
      unprovided import fails, major-mismatch warning.
- [x] Decision 0002 amended (interim, production direction noted).
- [x] `bun run verify` passes; `bun.lock` updated by `bun install`.

## Out of scope

- Per-extension installs, a shared content-addressed store, or anything that
  runs `npm install` per extension.
- Re-selecting the curated corpus.

## Handoff

Branch/commit: `t3/shared-dependency-allowlist-2` @
`bfa47f0b5c04fd2ea3e2c67dcee76bcba4184076` (implementation; handoff follows).

Verify: `verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 91.0s`
446 tests pass across 61 files; focused dependency tests also pass.

Done:

- Fast-forwarded round 3 and corrected its inconsistent package list, lint,
  formatting and oversized decision record. One ranked host list drives bundling,
  selection and exact dependency satisfaction; the original baseline ranking stays
  stable as the host list changes.
- Greedy selection retains the 13 eligible picks through rank 14, including
  `date-fns`, before the 75 MiB budget cuts off rank 15. No lower-ranked packages
  displace higher-ranked ones. Decision 0002 records exclusions and measurements.
- Default, lodash/date-fns subpath, unprovided and major-warning tests pass under
  Node 24. Graph tests cover every supplied package; transitive versions resolve
  within their own graphs, and extensions cannot import private transitives.
- Sparse, disk-guarded `corpus:scan` rerun at the existing pin; exact satisfaction
  recorded in both generated dependency reports. Curated selection unchanged.

Disk: clean frozen installs in this worktree with the repository's `bunfig.toml`,
using pre-task `18477ef` host manifest/lock as baseline, then the final pins:
`du -sh node_modules`: **114M → 189M**;
`du -sk node_modules`: **116168 → 192528 KiB**;
added **76360 KiB / 74.57 MiB**, below **75 MiB**. Including the next ranked
package, `rss-parser`, measured 78856 KiB / 77.01 MiB added in the measurement
workspace. No lower-ranked replacement was allowed, even if it fit the remainder.
Directory allocation can vary by a few KiB across equivalent clean installations.

Pins were rechecked with `npm view <pkg>@<plurality-major> version
dist.unpackedSize scripts dependencies --json`; table order is corpus import rank.
Registry bytes are package payloads; graph KiB are standalone allocated `du -sk`
measurements (shared transitives mean these rows must not be summed).

| Package              | Version | Registry bytes | Graph KiB |
| -------------------- | ------- | -------------: | --------: |
| `node-fetch`         | 3.3.2   |         107319 |      9456 |
| `axios`              | 1.20.0  |        1983343 |      4216 |
| `date-fns`           | 4.4.0   |       10902084 |     28076 |
| `lodash`             | 4.18.1  |        1413741 |      5024 |
| `zod`                | 4.6.7   |        6148944 |      8384 |
| `cheerio`            | 1.2.0   |        1011246 |      9756 |
| `dayjs`              | 1.11.23 |         681693 |      2140 |
| `fuse.js`            | 7.5.0   |         417199 |       456 |
| `uuid`               | 11.1.1  |         134222 |       824 |
| `nanoid`             | 5.1.16  |          13640 |        68 |
| `cross-fetch`        | 4.1.0   |          93252 |       724 |
| `moment`             | 2.31.0  |        4497001 |      5552 |
| `node-html-markdown` | 1.3.0   |         104791 |      2636 |

Each pin adds the next most-imported portable package, not a new runtime boundary.
`date-fns` (135 importers) justifies 10.9 MB unpacked; `zod` (64) justifies 6.1 MB.
All selected graphs were installed without running scripts and inspected: no
preinstall/install/postinstall hooks or native `.node` binaries. Registry `prepare`
scripts (e.g. axios) are development/git-install hooks, not registry install hooks.
`@raycast/utils@2.3.2` was already provided. Internal-only `semver@7.8.5`
(101065 registry bytes) handles npm ranges; dev-only `@types/semver@7.8.0` (24724)
provides strict types. Both latest exact pins were rechecked with `npm view`.

Corpus result: **2009/3443** dependency-satisfied extensions, **436 additional**
over the stable **1573** baseline. Generated JSON records both the exact host
provided list and count; the markdown renders them. The existing top-N curve and
all 1427 package rows are unchanged. `raycast-usage.json` is byte-for-byte
unchanged: same corpus pin, inventory and usage-scanner semantics. The scan took
149.6s, reported 2 existing declaration parse failures, and peaked at **265 MB**
for all `.cache` (including measurement workspaces), below the default 600 MB
guard. `.cache/raycast-extensions` and measurement installs were deleted afterwards.

Not done / risks:

- The 15 MB individual graph guard uses **logical installed bytes** (`du -sb`),
  while the total budget uses allocated blocks (`du -sk`). Required `date-fns`
  is 11893316 logical bytes but 28076 allocated KiB because of many small files.
  A 15 MB allocated-block interpretation would conflict with mandatory date-fns.
- Satisfaction means every declared/imported package name is available, regardless
  of declared major; shared majors and unsupported host capabilities can still
  break commands. CLI warnings report incompatible declared majors.
