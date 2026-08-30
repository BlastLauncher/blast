# ADR 0064: Bounded parser, color, and URL utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the sixth bounded dependency seed, 754 corpus extensions still failed
before scene execution because an imported package was absent from the explicit
e2e vendor root. The dependency census identified a small group of parsers,
formatting and date helpers, URL and color utilities, image metadata checks,
and local-data helpers. Network clients, platform bridges, native or WASM
packages, databases, and extension-local aliases remain outside this slice.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package           |  Version |
| ----------------- | -------: |
| `color-namer`     |  `1.4.0` |
| `cronstrue`       | `3.24.0` |
| `csv-parse`       |  `5.6.0` |
| `debounce`        |  `1.2.1` |
| `dedupe`          |  `4.0.3` |
| `fromnow`         |  `3.0.1` |
| `image-meta`      |  `0.2.1` |
| `is-image`        |  `4.0.0` |
| `is-valid-domain` |  `0.1.6` |
| `lodash.isempty`  |  `4.4.0` |
| `lodash.unescape` |  `4.0.1` |
| `nzh`             | `1.0.14` |
| `parse-url`       | `11.1.0` |
| `simple-plist`    |  `1.4.0` |
| `tiny-pinyin`     |  `1.3.2` |
| `title`           |  `3.5.3` |
| `use-interval`    |  `1.4.0` |
| `url-join`        |  `5.0.0` |
| `weeknumber`      |  `1.2.1` |
| `xml-js`          | `1.6.11` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, or cross-extension capabilities. Package behavior
that depends on such capabilities remains a separate host-policy boundary.

The targeted reprobe of the 754 prior dependency failures rendered 18 entries
and moved 4 to process/runtime failures. The full corpus comparison reduced
dependency failures from 754 to 734 and increased rendered outcomes from 1,948
to 1,967. Process failures varied from 210 to 209 and structured errors from 0
to 2; those aggregate changes are recorded as normal probe variance rather
than attributed to this seed alone.

## Consequences

The measured compatibility pass rate is now 1,967 of 3,231 extensions
(60.88%), or 1,967 of 2,915 extensions with a selected renderable command
(67.48%). The seed covers a bounded parser and utility frontier while keeping
the next diagnostics focused on the remaining dependency and process outcomes.
The support matrix continues to distinguish package availability from API
compatibility and host capability policy.
