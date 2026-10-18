# ADR 0061: Bounded parser and utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the third bounded vendor seed, the pinned corpus probe still classified
844 extensions as third-party dependency failures. The refreshed diagnostic
census identified a repeatable group of parsers, format helpers, state
utilities, and archive/image-adjacent packages that can be measured through
the existing vendored dependency root without defining a new host capability.

The dependency graph must remain reviewable. Network clients, native/WASM
modules, extension-local aliases, and broad host integrations remain separate
policy decisions.

## Decision

Add a fourth exact-version, development-only seed of 22 direct packages to the
private `@blastlauncher/e2e` package:

| Package               | Pinned version |
| --------------------- | -------------: |
| `adm-zip`             |       `0.5.16` |
| `bplist-parser`       |        `0.3.2` |
| `change-case`         |        `5.4.4` |
| `chrono-node`         |        `2.9.1` |
| `d3-color`            |        `3.1.0` |
| `date-fns-tz`         |        `3.2.0` |
| `graphql-tag`         |       `2.12.7` |
| `image-size`          |        `2.0.2` |
| `jotai`               |       `2.12.2` |
| `json2md`             |        `2.0.3` |
| `linkedom`            |      `0.18.13` |
| `marked`              |       `15.0.7` |
| `moment-timezone`     |       `0.5.46` |
| `papaparse`           |        `5.5.3` |
| `parse-git-config`    |        `3.0.0` |
| `pinyin-pro`          |       `3.28.1` |
| `pretty-bytes`        |        `6.1.1` |
| `query-string`        |        `8.1.0` |
| `raycast-toolkit`     |        `1.0.6` |
| `slugify`             |        `1.6.6` |
| `timeago.js`          |        `4.0.2` |
| `turndown-plugin-gfm` |        `1.0.2` |

The workspace's explicit e2e vendor root supplies these packages to the probe;
the runtime still never installs extension dependencies or runs their package
manager scripts. The lockfile records the exact transitive graph.

A targeted reprobe of the 844 previously dependency-classified entries
rendered 33 and moved 16 to process/runtime failures. The full corpus probe,
including the independently measured React context-composition fix, reduced
dependency failures from 844 to 797 and recorded 1,912 rendered scenes, up
from 1,866. The aggregate change remains subject to normal process and
dependency variance.

The bundler now registers synchronous cleanup for default temporary directories
on exit and termination. The corpus probe gives each run a private directory
prefix and removes that run's directories after completion, including after a
forced child-process cleanup path. Explicit caller-owned cache directories
remain untouched.

## Consequences

- The probe can measure another reviewable dependency group without weakening
  the Raycast API boundary or granting host capabilities.
- Exact versions and transitive resolutions remain visible in the workspace
  manifest and lockfile; the seed is not a production dependency installer or
  a promise that all semver ranges are satisfied.
- Remaining packages stay visible in the diagnostic census. Future seeds must
  continue to separate policy-neutral availability from network,
  cross-extension, native, and WASM behavior.
