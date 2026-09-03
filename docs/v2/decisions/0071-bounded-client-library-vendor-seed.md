# ADR 0071: Bounded client-library vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The fourteenth corpus dependency slice starts from the thirteenth post-slice
result: 2,055 of 3,231 extensions rendered, while 621 stopped at third-party
dependency resolution. The remaining portable gaps were concentrated in cloud
storage, Google APIs, Notion Markdown, translation, archive/download, database,
messaging, PocketBase, code-generation, and spreadsheet clients.

The validation host is ARM64 Linux (`aarch64`, Node 24.20.0). The batch must not
silently add OS or host capabilities. Native database addons were not selected;
WASM, macOS, host-process, and Solana's optional native websocket-helper path
remain deferred.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package                          | Version    | Intended measured surface          |
| -------------------------------- | ---------- | ---------------------------------- |
| `@aws-sdk/client-s3`             | `3.1121.0` | S3 client imports                  |
| `@googleapis/calendar`           | `16.0.0`   | Google Calendar client imports     |
| `@googleapis/gmail`              | `18.0.0`   | Gmail client imports               |
| `@tryfabric/martian`             | `1.2.4`    | Notion Markdown conversion imports |
| `@vitalets/google-translate-api` | `9.2.1`    | Translation client imports         |
| `archiver`                       | `8.0.0`    | Archive generation imports         |
| `download`                       | `8.0.0`    | Download helper imports            |
| `mongodb`                        | `7.6.0`    | MongoDB client imports             |
| `mqtt`                           | `5.15.2`   | MQTT client imports                |
| `pg`                             | `8.23.0`   | PostgreSQL client imports          |
| `pocketbase`                     | `0.28.0`   | PocketBase client imports          |
| `quicktype-core`                 | `26.0.0`   | Local code-generation imports      |
| `xlsx`                           | `0.18.5`   | Spreadsheet parsing imports        |

Install with package-manager lifecycle scripts disabled. This changes dependency
resolution for measurement only: the runtime still never installs extension
dependencies, and this ADR grants no network, database, host, cross-extension,
or OS capability. PostgreSQL and MongoDB optional/native addons are not part of
the selected vendor roots.

## Evidence

The targeted reprobe covered all 621 previous dependency failures. Thirteen
rendered and five moved into process/runtime outcomes, leaving 603 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Thirteenth slice | Fourteenth slice | Delta |
| ------------------------------ | ---------------: | ---------------: | ----: |
| renders a scene                |            2,055 |            2,072 |   +17 |
| third-party dependency failure |              621 |              603 |   -18 |
| process/startup failure        |              234 |              236 |    +2 |
| structured compatibility error |                2 |                1 |    -1 |
| not renderable command mode    |              316 |              316 |     0 |
| no entrypoint found            |                3 |                3 |     0 |

Coverage is now 2,072/3,231 (64.13%) overall and 2,072/2,915 (71.08%) among
extensions with a selected renderable command. The aggregate retained
`open-targets-raycast/platform` as a strict malformed-child diagnostic. A
focused serial reprobe also surfaces the same unsupported List text-child
boundary in `crawldoc`; these are semantic contract checks, not ARM64 install
failures.

The selected packages resolved on ARM64 Linux with lifecycle scripts disabled.
The full probe reclaimed all run-scoped temporary bundle directories, and free
disk space remained at 25 GB during the slice.

## Consequences

- Cloud storage, Google API, Notion Markdown, translation, archive/download,
  database-client, messaging, PocketBase, code-generation, and spreadsheet
  packages can now be measured as available dependencies.
- Extensions that reach actual network or database behavior can still fail at
  the process boundary; those outcomes remain separate from API compatibility.
- The seed remains reviewable and usable on the current ARM64 Linux runner.
- `vitest`, `sql.js`, `osascript-tag`, `say`, `shell-env`, Solana, and other
  native, WASM, macOS, or host-process candidates remain held for explicit
  policy decisions.
- Future rounds should continue with small portable groups, then revisit
  runtime/API gaps before introducing host capabilities.
