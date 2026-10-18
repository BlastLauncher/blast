# ADR 0062: Bounded parser, crypto, and utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the fourth bounded vendor seed, the pinned corpus probe still classified
797 extensions as third-party dependency failures. The refreshed diagnostic
census identified a small group of parsers, formatters, fuzzy-match helpers,
validation utilities, and local crypto packages that can be measured through
the existing vendored dependency root without defining a new host capability.

Network clients, platform bridges, native/WASM modules, and extension-local
aliases remain separate policy decisions. The `eventsource-parser` entry in
this group is used as a parser dependency only; this decision does not grant
network access.

## Decision

Add a fifth exact-version, development-only seed of 17 direct packages to the
private `@blastlauncher/e2e` package:

| Package                | Pinned version |
| ---------------------- | -------------: |
| `@mozilla/readability` |        `0.6.0` |
| `bignumber.js`         |       `11.1.1` |
| `color-hash`           |        `2.0.2` |
| `cron-parser`          |        `5.6.0` |
| `dateformat`           |        `5.0.3` |
| `dedent-js`            |        `1.0.1` |
| `eventsource-parser`   |        `1.1.2` |
| `fast-fuzzy`           |       `1.12.0` |
| `fuzzysort`            |        `3.1.0` |
| `hi-base32`            |        `0.5.1` |
| `html-to-text`         |       `10.0.0` |
| `jose`                 |        `6.2.3` |
| `js-base64`            |        `3.8.0` |
| `lodash.groupby`       |        `4.6.0` |
| `numeral`              |        `2.0.6` |
| `otpauth`              |        `9.5.0` |
| `validator`            |     `13.15.35` |

The workspace's explicit e2e vendor root supplies these packages to the probe;
the runtime still never installs extension dependencies or runs their package
manager scripts. The lockfile records the exact transitive graph.

A targeted reprobe of the 797 previously dependency-classified entries
rendered 24 and moved 5 to process/runtime failures. The full corpus probe
reduced dependency failures from 797 to 770 and recorded 1,938 rendered
scenes, up from 1,912. Process failures stayed at 202; the structured failure
count varied from one to two, so the aggregate result remains subject to
normal process and dependency variance.

## Consequences

- The probe can measure another reviewable dependency group without weakening
  the Raycast API boundary or granting host capabilities.
- Exact versions and transitive resolutions remain visible in the workspace
  manifest and lockfile; the seed is not a production dependency installer or
  a promise that all semver ranges are satisfied.
- Remaining packages stay visible in the diagnostic census. Future seeds must
  continue to separate policy-neutral availability from network,
  cross-extension, native, and WASM behavior.
