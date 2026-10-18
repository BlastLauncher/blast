# ADR 0065: Bounded data, React, and streaming utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the seventh bounded dependency seed, 734 corpus extensions still failed
before scene execution because an imported package was absent from the explicit
e2e vendor root. The next measured group consisted of deterministic test-data,
encoding, TOML/header parsing, queueing, validation, React utility, form-data,
and path helpers. Network clients, OS bridges, native or WASM packages,
databases, and extension-local aliases remain outside this slice.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package                           |  Version |
| --------------------------------- | -------: |
| `@faker-js/faker`                 | `10.5.0` |
| `@iarna/toml`                     |  `2.2.5` |
| `@nem035/gpt-3-encoder`           |  `1.1.7` |
| `@total-typescript/ts-reset`      |  `0.6.1` |
| `@web3-storage/parse-link-header` |  `3.1.0` |
| `calendar`                        |  `0.1.1` |
| `expand-tilde`                    |  `2.0.2` |
| `formdata-node`                   |  `6.0.3` |
| `fzf`                             |  `0.5.2` |
| `p-queue`                         |  `8.0.1` |
| `react-use`                       | `17.6.0` |
| `stream-json`                     |  `1.9.1` |
| `valibot`                         |  `1.1.0` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, or cross-extension capabilities. Package behavior
that depends on such capabilities remains a separate host-policy boundary.

The targeted reprobe of the 734 prior dependency failures rendered 20 entries
and moved 6 to process/runtime failures. The full corpus comparison reduced
dependency failures from 734 to 709 and increased rendered outcomes from 1,967
to 1,980. Process failures varied from 209 to 222 and structured errors from 2
to 1; those aggregate changes are recorded as normal probe variance rather
than attributed to this seed alone.

## Consequences

The measured compatibility pass rate is now 1,980 of 3,231 extensions
(61.28%), or 1,980 of 2,915 extensions with a selected renderable command
(67.92%). The seed covers a bounded data and utility frontier while keeping the
next diagnostics focused on the remaining dependency and process outcomes. The
support matrix continues to distinguish package availability from API
compatibility and host capability policy.
