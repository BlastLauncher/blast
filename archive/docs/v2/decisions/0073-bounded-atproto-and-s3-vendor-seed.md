# ADR 0073: Bounded AT Protocol and S3 vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The sixteenth corpus dependency slice starts from the fifteenth post-slice
result: 2,075 of 3,231 extensions rendered, while 585 stopped at third-party
dependency resolution. A small remaining portable pocket was concentrated in
AT Protocol clients and AWS S3 request signing. The batch needed to stay
compatible with the ARM64 Linux measurement host (`aarch64`, Node 24.20.0)
without expanding the runtime's network or credential boundary.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package                         | Version    | Intended measured surface    |
| ------------------------------- | ---------- | ---------------------------- |
| `@atproto/api`                  | `0.18.16`  | AT Protocol client imports   |
| `@atproto/identity`             | `0.4.1`    | AT Protocol identity imports |
| `@atproto/lexicon`              | `0.4.0`    | AT Protocol schema imports   |
| `@atproto/uri`                  | `0.1.1`    | AT Protocol URI imports      |
| `@aws-sdk/s3-request-presigner` | `3.1121.0` | S3 signing helper imports    |

Install with package-manager lifecycle scripts disabled. This changes
dependency resolution for measurement only: the runtime still never installs
extension dependencies, and this ADR grants no network, credential, host,
cross-extension, or OS capability. No native, WASM, macOS, or host-process
package was selected directly.

## Evidence

The targeted reprobe covered all 585 previous dependency failures. Four
rendered and none moved into process/runtime outcomes, leaving 581 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Fifteenth slice | Sixteenth slice | Delta |
| ------------------------------ | --------------: | --------------: | ----: |
| renders a scene                |           2,075 |           2,082 |    +7 |
| third-party dependency failure |             585 |             580 |    -5 |
| process/startup failure        |             250 |             248 |    -2 |
| structured compatibility error |               2 |               2 |     0 |
| not renderable command mode    |             316 |             316 |     0 |
| no entrypoint found            |               3 |               3 |     0 |

Coverage is now 2,082/3,231 (64.44%) overall and 2,082/2,915 (71.42%) among
extensions with a selected renderable command. The two structured outcomes
remain the strict malformed-List text-child diagnostics in `crawldoc` and
`open-targets-raycast/platform`; focused reprobes show they are semantic
contract checks, not ARM64 installation failures. The full-run process delta is
normal probe variance; the four targeted renders provide the direct attribution
for this seed.

All selected roots resolved on ARM64 Linux with lifecycle scripts disabled. The
full probe reclaimed every run-scoped temporary bundle directory; free disk
space remained at approximately 24 GB after installation and probing.

## Consequences

- AT Protocol client, identity, schema, URI, and AWS S3 signing packages can
  now be measured as available dependencies.
- Extensions that reach provider networks or credentials can still fail at the
  process boundary; those outcomes remain separate from API compatibility.
- The seed is small, portable, and reviewable on the current ARM64 Linux
  runner without adding native build or host capability requirements.
- `vitest`, `sql.js`, `osascript-tag`, `shell-env`, Solana, `say`, sound,
  database-native addons, and larger client graphs remain held for explicit
  platform, runtime, or disk-policy decisions.
- Future rounds should audit the remaining small portable frontier before
  opening platform-specific dependency policy.
