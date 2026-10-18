# ADR 0068: Bounded schema, state, and cookie utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the tenth bounded dependency seed, 668 corpus extensions still failed
before scene execution because an imported package was absent from the explicit
e2e vendor root. The next measured group was a small set of local color and
contrast utilities, schema and OpenAPI parsers, TanStack persistence helpers,
React state integration, and cookie parsing. Network clients, OS bridges, test
runners, native or WASM packages, and large data-heavy packages remain outside
this slice.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package                                   |          Version |
| ----------------------------------------- | ---------------: |
| `@adobe/leonardo-contrast-colors`         | `1.0.0-alpha.13` |
| `@asyncapi/parser`                        |         `1.14.1` |
| `@tanstack/query-async-storage-persister` |         `5.66.4` |
| `@tanstack/react-query-persist-client`    |         `5.66.9` |
| `@xstate/react`                           |          `6.1.0` |
| `colorjs.io`                              |          `0.5.2` |
| `oazapfts`                                |         `4.10.0` |
| `tough-cookie`                            |          `6.0.2` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, native, or cross-extension capabilities. Parser
dependencies that contain network-capable helpers remain inert unless an
extension explicitly invokes them; host policy is unchanged.

The targeted reprobe of the 668 prior dependency failures rendered 3 entries
and moved 3 to process/runtime failures. The full corpus comparison reduced
dependency failures from 668 to 663 and increased rendered outcomes from 2,022
to 2,024. Process failures varied from 220 to 225, and the structured count
varied from two to zero; those aggregate changes are recorded as normal probe
variance rather than attributed to this seed alone.

## Consequences

The measured compatibility pass rate is now 2,024 of 3,231 extensions
(62.64%), or 2,024 of 2,915 extensions with a selected renderable command
(69.43%). The seed covers a bounded schema, color, persistence, state, and
cookie utility frontier while keeping remaining dependency, process, and host
capability outcomes visible. The support matrix continues to distinguish
package availability from API compatibility and host capability policy.
