# ADR 0072: Bounded client-utility vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The fifteenth corpus dependency slice starts from the fourteenth post-slice
result: 2,072 of 3,231 extensions rendered, while 603 stopped at third-party
dependency resolution. The remaining portable gaps included small cloud,
mail, analytics, proxy, media, locking, and conversion clients. The batch had
to preserve the measured dependency-only boundary on the ARM64 Linux runner
(`aarch64`, Node 24.20.0), where native, WASM, macOS, and host-process behavior
cannot be treated as generally portable.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package                     | Version  | Intended measured surface       |
| --------------------------- | -------- | ------------------------------- |
| `@alicloud/pop-core`        | `1.8.0`  | Alibaba cloud client imports    |
| `@api-blueprints/pathmaker` | `1.3.0`  | URL/path helper imports         |
| `@aternus/csv-to-xlsx`      | `3.0.5`  | CSV/spreadsheet conversion      |
| `ali-oss`                   | `6.23.0` | Object-storage client imports   |
| `cloudconvert`              | `3.0.0`  | Conversion client imports       |
| `cloudinary`                | `2.11.0` | Media client imports            |
| `imapflow`                  | `1.7.6`  | IMAP client imports             |
| `mixpanel`                  | `0.23.0` | Analytics client imports        |
| `placeholders-toolkit`      | `0.1.5`  | Placeholder utility imports     |
| `proper-lockfile`           | `4.1.2`  | Filesystem lock utility imports |
| `proxy-agent`               | `8.0.2`  | Proxy-agent imports             |
| `ytdl-core`                 | `4.11.5` | YouTube helper imports          |

Install with package-manager lifecycle scripts disabled. This changes
dependency resolution for measurement only: the runtime still never installs
extension dependencies, and this ADR grants no network, database, host,
cross-extension, or OS capability. The workspace release-age policy remains
unchanged. Large graphs, test-only packages, WASM, macOS, native, and
host-process candidates remain deferred.

## Evidence

The targeted reprobe covered all 603 previous dependency failures. Fifteen
rendered and three moved into process/runtime outcomes, leaving 585 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Fourteenth slice | Fifteenth slice | Delta |
| ------------------------------ | ---------------: | --------------: | ----: |
| renders a scene                |            2,072 |           2,075 |    +3 |
| third-party dependency failure |              603 |             585 |   -18 |
| process/startup failure        |              236 |             250 |   +14 |
| structured compatibility error |                1 |               2 |    +1 |
| not renderable command mode    |              316 |             316 |     0 |
| no entrypoint found            |                3 |               3 |     0 |

Coverage is now 2,075/3,231 (64.22%) overall and 2,075/2,915 (71.18%) among
extensions with a selected renderable command. The aggregate records the
strict malformed-List text-child diagnostics in `crawldoc` and
`open-targets-raycast/platform`; a focused serial reprobe confirms these are
semantic contract checks, not ARM64 installation failures. The process and
structured deltas vary between full runs, so the targeted dependency result is
the stronger attribution for this seed.

All selected roots resolved on ARM64 Linux with lifecycle scripts disabled. The
full probe reclaimed every run-scoped temporary bundle directory; free disk
space remained at approximately 24 GB after installation and probing.

## Consequences

- Alibaba, object-storage, conversion, media, mail, analytics, proxy, locking,
  placeholder, and YouTube helper packages can now be measured as available
  dependencies.
- Extensions that reach network, credentials, or provider behavior can still
  fail at the process boundary; those outcomes remain separate from API
  compatibility.
- The seed is reviewable and usable on the current ARM64 Linux measurement
  runner without adding native build or host capability requirements.
- `vitest`, `sql.js`, `osascript-tag`, `shell-env`, Solana, `say`, sound,
  database-native addons, and other native, WASM, macOS, or host-process
  candidates remain held for explicit policy decisions.
- Future rounds should audit the remaining small portable frontier and then
  revisit runtime/API gaps before opening platform-specific dependency policy.
