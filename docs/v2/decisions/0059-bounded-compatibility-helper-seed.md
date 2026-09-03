# ADR 0059: Bounded compatibility-helper vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the first two bounded vendor seeds, the pinned corpus probe still
classified 915 extensions as third-party dependency failures. The diagnostic
run showed a concentrated group of ordinary client utilities, parsers, image
helpers, and Raycast ecosystem helpers. The top-level API import census and
emitted declaration audit were clean for the measured surface, so these
dependency blockers became the next measurable coverage constraint.

Adding every unresolved package would mix pure utilities with network clients,
native/WASM modules, extension-local aliases, and host-policy boundaries. The
probe needs a small, reproducible input group instead.

## Decision

Add a third exact-version, development-only seed to the private
`@blastlauncher/e2e` package:

| Package                        | Pinned version |
| ------------------------------ | -------------: |
| `@chrismessina/raycast-logger` |        `1.4.0` |
| `@tanstack/react-query`        |       `5.66.9` |
| `algoliasearch`                |       `4.25.2` |
| `jimp`                         |        `1.6.1` |
| `openai`                       |       `5.12.2` |
| `raycast-cross-extension`      |        `0.2.3` |
| `remove-markdown`              |        `0.6.4` |
| `striptags`                    |        `3.2.0` |
| `swr`                          |        `2.3.3` |
| `untildify`                    |        `6.0.0` |
| `use-debounce`                 |       `10.1.1` |

The workspace's explicit e2e vendor root supplies these packages to the probe;
the runtime still never installs extension dependencies or runs their package
manager scripts. The lockfile records the exact transitive graph.

The targeted reprobe of the 915 previously dependency-classified entries
rendered 55 and moved 29 to process/runtime failures. The full corpus probe
reduced third-party dependency failures from 915 to 844 and recorded 1,866
rendered scenes, up from 1,816. The aggregate render change remains subject to
normal process and dependency variance, so the seed is a measurement input,
not a claim that all extensions in the group are compatible.

Network behavior, cross-extension routing, native modules, WASM packages, and
other broad host boundaries remain deferred. Package availability does not
grant any capability to an extension.

## Consequences

- The corpus probe can measure another reviewable set of dependency blockers
  while keeping the e2e dependency graph explicit and reproducible.
- The measured outcome improves the current full-run render count and narrows
  the dependency failure class without weakening API validation.
- Remaining missing packages stay visible in the diagnostic census; future
  seeds should continue to separate pure utilities from packages requiring
  explicit host or policy decisions.
