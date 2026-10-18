# ADR 0070: Bounded JavaScript SDK and HTTP vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The thirteenth corpus dependency slice starts from the twelfth post-slice
result: 2,039 of 3,231 extensions rendered, while 642 stopped at third-party
dependency resolution. The remaining high-yield JavaScript gaps were concentrated
in AI/provider, MCP, GraphQL/OpenAPI, hosted-service, blockchain, messaging,
and transcript-client imports.

The validation host is ARM64 Linux (`aarch64`, Node 24.20.0). The batch must not
turn dependency measurement into a new host capability. Solana was held because
its `rpc-websockets` graph includes optional native helpers; WASM, macOS, and
host-process packages remain deferred.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package                     | Version   | Intended measured surface            |
| --------------------------- | --------- | ------------------------------------ |
| `ai`                        | `5.0.249` | AI provider orchestration imports    |
| `@ai-sdk/openai`            | `2.0.122` | OpenAI provider imports              |
| `@anthropic-ai/sdk`         | `0.122.0` | Anthropic client imports             |
| `@modelcontextprotocol/sdk` | `1.30.0`  | MCP client/server imports            |
| `@slack/web-api`            | `7.19.0`  | Slack API client imports             |
| `ethers`                    | `6.17.0`  | Ethereum client and encoding imports |
| `eventsource`               | `2.0.2`   | Server-sent event clients            |
| `meilisearch`               | `0.45.0`  | Search service clients               |
| `openapi-fetch`             | `0.17.0`  | Generated OpenAPI clients            |
| `stripe`                    | `17.7.0`  | Stripe API client imports            |
| `user-agents`               | `1.1.675` | User-agent data and generation       |
| `youtube-transcript`        | `1.3.1`   | Transcript client imports            |

Advance the existing `zod` e2e seed to `3.25.76` so the provider SDK peer
requirements are represented by the same explicit vendor root. Install with
package-manager lifecycle scripts disabled. This changes dependency resolution
for measurement only: the runtime still never installs extension dependencies,
and this ADR grants no network, host, cross-extension, or OS capability. The
existing optional websocket helper graph used by workspace packages and Ethers
is not treated as a new host capability.

## Evidence

The targeted reprobe covered all 642 previous dependency failures. Sixteen
rendered and six moved into process/runtime outcomes, leaving 620 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Twelfth slice | Thirteenth slice | Delta |
| ------------------------------ | ------------: | ---------------: | ----: |
| renders a scene                |         2,039 |            2,055 |   +16 |
| third-party dependency failure |           642 |              621 |   -21 |
| process/startup failure        |           229 |              234 |    +5 |
| structured compatibility error |             2 |                2 |     0 |
| not renderable command mode    |           316 |              316 |     0 |
| no entrypoint found            |             3 |                3 |     0 |

Coverage is now 2,055/3,231 (63.60%) overall and 2,055/2,915 (70.50%) among
extensions with a selected renderable command. The two structured outcomes are
the retained deterministic malformed-child diagnostics for `crawldoc` and
`open-targets-raycast/platform`; both pass text directly to `List`, which the
semantic scene contract intentionally rejects.

The packages installed successfully on ARM64 Linux with lifecycle scripts
disabled. The full probe reclaimed all run-scoped temporary bundle directories;
free disk space moved from 26 GB to 25 GB during installation and remained
stable during probing.

## Consequences

- AI/provider, MCP, messaging, search, OpenAPI, blockchain, and transcript
  packages can now be measured as available dependencies in the corpus probe.
- Extensions that reach actual network or host behavior can still fail at the
  process boundary; those outcomes remain separate from API compatibility.
- The seed remains reviewable and usable on the current ARM64 Linux runner.
- Solana, `sql.js`, `osascript-tag`, `say`, `shell-env`, and other native,
  WASM, macOS, or host-process candidates remain held for explicit policy
  decisions.
- Future rounds should continue with small pure-JavaScript or policy-neutral
  groups, then revisit runtime/API gaps before introducing host capabilities.
