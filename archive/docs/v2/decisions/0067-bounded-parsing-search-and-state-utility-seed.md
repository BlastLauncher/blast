# ADR 0067: Bounded parsing, search, and state utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the ninth bounded dependency seed, 683 corpus extensions still failed
before scene execution because an imported package was absent from the explicit
e2e vendor root. The next measured group was a compact set of local parsers,
text and XML utilities, hashes, date and timezone data, stream helpers, and
state-machine utilities. Network clients, OS bridges, test runners, native or
WASM packages, and large data-heavy packages remain outside this slice.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package          |   Version |
| ---------------- | --------: |
| `binary-split`   |   `1.0.5` |
| `city-timezones` |   `1.3.4` |
| `edn-data`       |   `1.2.2` |
| `js-beautify`    |  `1.15.4` |
| `jsonwebtoken`   |   `9.0.3` |
| `lodash-es`      |  `4.18.1` |
| `mailparser`     |  `3.9.17` |
| `phone`          |  `3.1.72` |
| `showdown`       |   `2.1.0` |
| `suncalc`        |   `1.9.0` |
| `svgson`         |   `5.3.1` |
| `through2-map`   |   `4.0.0` |
| `tlds`           | `1.261.0` |
| `ts-dedent`      |   `2.3.0` |
| `ts-fsrs`        |   `4.6.1` |
| `ts-md5`         |   `1.3.1` |
| `ts-results-es`  |   `3.6.0` |
| `ulid`           |   `2.4.0` |
| `utf8`           |   `3.0.0` |
| `vkbeautify`     |  `0.99.3` |
| `xstate`         |  `5.32.6` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, native, or cross-extension capabilities. Packages
that are only useful after such a capability is available remain separate host
policy work.

The targeted reprobe of the 683 prior dependency failures rendered 14 entries
and moved 4 to process/runtime failures. The full corpus comparison reduced
dependency failures from 683 to 668 and increased rendered outcomes from 2,005
to 2,022. Process failures varied from 223 to 220, while the non-renderable
count stayed fixed and the structured compatibility count varied from one to
two; those aggregate changes are recorded as normal probe variance rather than
attributed to this seed alone.

## Consequences

The measured compatibility pass rate is now 2,022 of 3,231 extensions
(62.58%), or 2,022 of 2,915 extensions with a selected renderable command
(69.37%). The seed covers a bounded local utility frontier while keeping the
remaining dependency, process, and structured outcomes visible. The support
matrix continues to distinguish package availability from API compatibility and
host capability policy.
