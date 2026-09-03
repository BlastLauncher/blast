# ADR 0035: Safe utility vendor seed

- Status: accepted
- Date: 2026-08-29

## Context

After ADR 0034, 960 extensions still classified as third-party dependency
failures. The next unresolved names include network SDKs, native or WASM
packages, cross-extension helpers, and ordinary parsers and utilities. They
must not all be added as one undifferentiated dependency graph: package
availability is a probe input, while capability policy remains a separate
boundary.

## Decision

Add a second exact-version, development-only seed to the private
`@blastlauncher/e2e` package for the low-risk utility and parser group:

| Package               | Pinned version |
| --------------------- | -------------: |
| `file-url`            |        `4.0.0` |
| `filesize`            |      `11.0.13` |
| `gray-matter`         |        `4.0.3` |
| `javascript-time-ago` |        `2.6.4` |
| `luxon`               |        `3.7.2` |
| `node-html-parser`    |        `7.0.1` |
| `qrcode`              |        `1.5.4` |
| `tildify`             |        `3.0.0` |
| `ts-pattern`          |        `5.9.0` |
| `turndown`            |        `7.2.0` |

An isolated esbuild audit against the first seed resolved 46 of the remaining
960 dependency-classified entrypoints. This is a bundle-resolution signal
only; the pinned corpus reprobe must confirm that the extensions render.

Network clients, cross-extension packages, native/WASM packages, and packages
whose host behavior is not yet policy-defined remain outside this seed. The
runtime still never invokes a package manager or grants a capability because a
package is present.

## Consequences

- The dependency graph grows in a reviewable group with exact versions and
  lockfile-integrity records.
- Pure utility and parser imports can be measured without conflating them with
  network, process, native, or cross-extension policy.
- A failed import or runtime assumption remains visible as a dependency or
  process outcome; adding a package does not mark an extension compatible.
- Future seeds should preserve this separation and use rendered corpus results
  to justify their size.
