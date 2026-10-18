# ADR 0074: Bounded client-library vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The seventeenth corpus dependency slice starts from the sixteenth post-slice
result: 2,082 of 3,231 extensions rendered, while 580 stopped at third-party
dependency resolution. The highest-yield remaining portable client imports
were concentrated in Clerk, LangChain, and Salesforce extensions. The batch had
to remain usable on the ARM64 Linux measurement host (`aarch64`, Node 24.20.0)
without adding network, credential, native, or host-process behavior.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package             | Version  | Intended measured surface |
| ------------------- | -------- | ------------------------- |
| `@clerk/backend`    | `3.7.0`  | Clerk backend client      |
| `@langchain/core`   | `0.3.39` | LangChain core imports    |
| `@langchain/openai` | `0.4.4`  | LangChain OpenAI imports  |
| `@salesforce/core`  | `6.5.3`  | Salesforce client imports |

Install with package-manager lifecycle scripts disabled. This changes
dependency resolution for measurement only: the runtime still never installs
extension dependencies, and this ADR grants no network, credential, host,
cross-extension, or OS capability. No native, WASM, macOS, or host-process
package was selected directly.

## Evidence

The targeted reprobe covered all 580 previous dependency failures. Five
rendered and one moved into a process/runtime outcome, leaving 574 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Sixteenth slice | Seventeenth slice | Delta |
| ------------------------------ | --------------: | ----------------: | ----: |
| renders a scene                |           2,082 |             2,090 |    +8 |
| third-party dependency failure |             580 |               573 |    -7 |
| process/startup failure        |             248 |               249 |    +1 |
| structured compatibility error |               2 |                 0 |    -2 |
| not renderable command mode    |             316 |               316 |     0 |
| no entrypoint found            |               3 |                 3 |     0 |

Coverage is now 2,090/3,231 (64.69%) overall and 2,090/2,915 (71.70%) among
extensions with a selected renderable command. The full run classified the
known malformed-List cases in `crawldoc` and `open-targets-raycast/platform`
as process failures, while focused serial reprobes continue to surface their
strict semantic boundary. The process and structured classifications vary
between runs; the five targeted renders provide the direct attribution for
this seed.

All selected roots resolved on ARM64 Linux with lifecycle scripts disabled. The
full probe reclaimed every run-scoped temporary bundle directory; free disk
space remained at approximately 24 GB after installation and probing.

## Consequences

- Clerk, LangChain, and Salesforce client packages can now be measured as
  available dependencies.
- Extensions that reach provider networks or credentials can still fail at the
  process boundary; those outcomes remain separate from API compatibility.
- The seed is reviewable and portable on the current ARM64 Linux runner without
  adding native build or host capability requirements.
- `vitest`, `sql.js`, `osascript-tag`, `shell-env`, Solana, `say`, sound,
  database-native addons, and larger client graphs remain held for explicit
  platform, runtime, or disk-policy decisions.
- Future rounds should audit the remaining small portable frontier before
  opening platform-specific dependency policy.
