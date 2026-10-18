# ADR 0066: Bounded parsing, search, and validation vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the eighth bounded dependency seed, 709 corpus extensions still failed
before scene execution because an imported package was absent from the explicit
e2e vendor root. The next measured group was a compact set of parsing, search,
color, text, validation, typography, SQL-formatting, password-scoring, and
Raycast helper packages. Network clients, OS bridges, test runners, native or
WASM packages, and large data-heavy packages remain outside this slice.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package                      |  Version |
| ---------------------------- | -------: |
| `@chrismessina/raycast-kit`  |  `0.1.4` |
| `@ts-rest/core`              | `3.52.1` |
| `@zxcvbn-ts/core`            |  `3.0.4` |
| `@zxcvbn-ts/language-common` |  `3.0.4` |
| `@zxcvbn-ts/language-en`     |  `3.0.2` |
| `colord`                     | `2.10.0` |
| `es-toolkit`                 | `1.52.0` |
| `friendly-mimes`             |  `3.0.1` |
| `html-to-md`                 |  `0.8.8` |
| `jsqr`                       |  `1.4.0` |
| `json-ts`                    |  `1.6.4` |
| `linkify-it`                 |  `5.0.2` |
| `minisearch`                 |  `7.2.0` |
| `node-emoji`                 |  `2.2.0` |
| `opentype.js`                |  `1.3.4` |
| `p-min-delay`                |  `4.2.0` |
| `polished`                   |  `4.3.1` |
| `protobufjs`                 |  `7.5.4` |
| `raycast-hooks`              |  `1.0.4` |
| `sanitize-html`              | `2.17.7` |
| `sql-formatter`              | `15.8.2` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, native, or cross-extension capabilities. Packages
that are only useful after such a capability is available remain separate host
policy work.

The targeted reprobe of the 709 prior dependency failures rendered 21 entries
and moved 5 to process/runtime failures. The full corpus comparison reduced
dependency failures from 709 to 683 and increased rendered outcomes from 1,980
to 2,005. Process failures varied from 222 to 223, while non-renderable
commands and the single structured compatibility error were unchanged; those
aggregate changes are recorded as normal probe variance rather than attributed
to this seed alone.

## Consequences

The measured compatibility pass rate is now 2,005 of 3,231 extensions
(62.06%), or 2,005 of 2,915 extensions with a selected renderable command
(68.78%). The seed covers a bounded pure-utility frontier while keeping the
remaining dependency and process outcomes visible. The support matrix
continues to distinguish package availability from API compatibility and host
capability policy.
