# ADR 0069: Bounded JavaScript SDK vendor seed

- Status: Accepted
- Date: 2026-08-30

## Context

The twelfth corpus dependency slice starts from the eleventh post-slice result:
2,024 of 3,231 extensions rendered, while 663 stopped at third-party
dependency resolution. The highest-yield remaining groups were JavaScript SDKs
used by GraphQL, hosted-backend, Notion, GitHub, and HTTP-oriented extensions.

The validation host is ARM64 Linux (`aarch64`, Node 24.20.0). Native, WASM,
macOS-specific, and host-process packages are therefore poor candidates for a
shared seed and remain deferred. Network SDK availability also must not be
confused with permission to make network requests from an extension.

## Decision

Add these exact-version packages as development-only dependencies of the e2e
corpus probe:

| Package                 | Version   | Intended measured surface        |
| ----------------------- | --------- | -------------------------------- |
| `@apollo/client`        | `3.14.1`  | GraphQL client and cache imports |
| `@notionhq/client`      | `2.3.0`   | Notion client imports            |
| `@supabase/supabase-js` | `2.112.4` | Supabase client imports          |
| `graphql-request`       | `7.4.0`   | Small GraphQL request clients    |
| `ky`                    | `1.14.3`  | Fetch-wrapper imports            |
| `ofetch`                | `1.5.1`   | Fetch-wrapper imports            |
| `octokit`               | `5.0.5`   | GitHub API client imports        |

The packages are installed through the explicit workspace vendor root with
package-manager lifecycle scripts disabled. This changes dependency resolution
for measurement only; the runtime still never installs extension dependencies,
and this ADR grants no network, host, cross-extension, or OS capability. The
remaining static `fetch` import stays outside the adapter until a bounded host
network capability and policy exist.

## Evidence

The targeted reprobe covered all 663 previous dependency failures. Fourteen
rendered and twelve moved into process/runtime outcomes, leaving 637 in the
dependency-failure class for that targeted set. The full corpus comparison was:

| Outcome                        | Eleventh slice | Twelfth slice | Delta |
| ------------------------------ | -------------: | ------------: | ----: |
| renders a scene                |          2,024 |         2,039 |   +15 |
| third-party dependency failure |            663 |           642 |   -21 |
| process/startup failure        |            225 |           229 |    +4 |
| structured compatibility error |              0 |             2 |    +2 |
| not renderable command mode    |            316 |           316 |     0 |
| no entrypoint found            |              3 |             3 |     0 |

Coverage is now 2,039/3,231 (63.11%) overall and 2,039/2,915 (69.95%) among
extensions with a selected renderable command. The two structured outcomes are
deterministic malformed-child diagnostics: `crawldoc` and
`open-targets-raycast/platform` each pass text directly to `List`, which the
semantic scene contract intentionally rejects. They are not ARM64 installation
failures.

The packages installed successfully on ARM64 Linux with lifecycle scripts
disabled. The full probe reclaimed all run-scoped temporary bundle directories,
and disk availability remained 26 GB before and after the slice.

## Consequences

- GraphQL, hosted-backend, Notion, GitHub, and HTTP SDK packages can now be
  measured as available dependencies in the corpus probe.
- Extensions that reach actual network or host behavior can still fail at the
  process boundary; those outcomes remain separate from API compatibility.
- The seed remains reviewable and portable on the current ARM64 Linux runner.
- `sql.js`, `osascript-tag`, `say`, `shell-env`, native packages, and other
  WASM/macOS/host-process candidates remain held for explicit policy decisions.
- Future rounds should continue with small pure-JavaScript or policy-neutral
  groups, then revisit runtime/API gaps before introducing host capabilities.
