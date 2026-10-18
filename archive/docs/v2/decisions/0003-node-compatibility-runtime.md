# ADR 0003: Use Node.js as the initial compatibility runtime

- Status: accepted
- Date: 2026-08-27

## Context

Existing Raycast extensions rely on Node.js packages, resolution behavior, and
built-in modules. Selecting a different JavaScript runtime would add another
source of incompatibility before Blast can measure its API coverage.

## Decision

Use the repository's pinned Node.js version for the first isolated extension
host. Keep runtime launch behind an interface so Blast-native extensions may use
other runtimes later.

## Consequences

- Early compatibility work has fewer variables.
- Bun is not required for V2's first release.
- Performance work begins with lifecycle, caching, isolation, and protocol
  efficiency rather than runtime substitution.
