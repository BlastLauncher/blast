# ADR 0063: Bounded encoding, date, and React utility vendor seed

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

After the fifth bounded dependency seed, the corpus probe still classified 770
extensions as unavailable because their imports were not present in the
explicit e2e vendor root. The diagnostic census identified a small group of
encoding and local-crypto helpers, date and URL utilities, numeric and image
metadata helpers, local storage, and React utilities. Network clients,
platform bridges, native or WASM packages, databases, and extension-local
aliases remain intentionally held for separate policy decisions.

`crypto-js` is deprecated in the registry, but it is used by the measured
corpus. Pinning it as a development-only probe input records current
compatibility behavior; it does not make the package a production dependency
policy recommendation.

## Decision

Add the following exact-version packages to `@blastlauncher/e2e` as a
development-only vendor seed:

| Package                |  Version |
| ---------------------- | -------: |
| `@noble/hashes`        |  `1.8.0` |
| `bs58`                 |  `6.0.0` |
| `crypto-js`            |  `4.2.0` |
| `culori`               |  `4.0.1` |
| `currency-codes`       |  `2.2.0` |
| `exifr`                |  `7.1.3` |
| `jwt-decode`           |  `4.0.0` |
| `lodash.orderby`       |  `4.6.0` |
| `lunar-date-vn`        |  `1.0.6` |
| `node-localstorage`    |  `3.0.5` |
| `otplib`               | `12.0.1` |
| `parse-github-url`     |  `1.0.3` |
| `proper-url-join`      |  `2.1.1` |
| `ramda`                | `0.32.0` |
| `react-error-boundary` |  `6.1.1` |
| `tiny-relative-date`   |  `2.0.2` |
| `usehooks-ts`          |  `3.1.0` |

The vendor root supplies these packages to the esbuild probe. The runtime does
not install extension dependencies, run their package scripts, or grant new
network, filesystem, host, or cross-extension capabilities. `node-localstorage`
is therefore only a bundled utility in this measurement and is not a host
storage provider.

The targeted reprobe of the 770 prior dependency failures rendered 13 entries
and moved 2 to process/runtime failures. The full corpus comparison reduced
dependency failures from 770 to 754 and increased rendered outcomes from 1,938
to 1,948. Process failures varied from 202 to 210 and structured errors from 2
to 0; those aggregate changes are recorded as normal probe variance rather
than attributed to this seed alone.

## Consequences

The measured compatibility pass rate is now 1,948 of 3,231 extensions
(60.29%), or 1,948 of 2,915 extensions with a selected renderable command
(66.83%). The seed covers a bounded, policy-neutral dependency frontier and
keeps the next diagnostics focused on the remaining dependency and process
outcomes. The registry deprecation warning for `crypto-js` remains visible in
the install audit and should be revisited before any production dependency
policy is defined.
