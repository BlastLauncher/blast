# ADR 0023: Measured desktop discovery and command preferences

- Status: accepted
- Date: 2026-08-29

## Context

The post-Grid/menu/command-launch corpus probe still listed
`getSelectedText` (216 extensions), `getApplications` (186), and
`openCommandPreferences` (164) as the leading static blockers. The first two
return host-owned values, while the third opens a host-owned preferences view.
The compatibility adapter must expose their measured shapes without importing
OS APIs or widening the primitive capability wire.

## Decision

- Route `getSelectedText` through `selection.read`. A successful response must
  contain a string; missing or malformed values become a structured
  compatibility error.
- Route `getApplications(path?)` through `application.list`. The optional
  `PathLike` argument is normalized to a string primitive. The host returns a
  JSON-encoded array, which the adapter parses and validates into the measured
  `Application` shape (`name` and `path` required; localized name, bundle ID,
  and Windows App ID optional).
- Route `openCommandPreferences` through `preferences.openCommand` with no
  arguments. It remains a host operation rather than a scene mutation.
- Treat the official `Application` and `FileIcon` exports as type-only
  compatibility surface in the corpus probe; they do not imply runtime
  constructors.
- Add deterministic providers to the corpus and child-process fixtures. The
  production broker remains deny-by-default until a client supplies explicit
  OS providers, consent, and audit policy.

## Consequences

- Commands that read selected text, inspect installed applications, or link to
  their command preferences can cross the measured runtime boundary.
- Structured application data is validated at the adapter boundary and remains
  transport-safe as a primitive string on the existing capability protocol.
- The pinned corpus probe increased end-to-end renders from 437 to 484
  extensions (13.53% to 14.98%); the next static leaders are
  `getSelectedFinderItems`, `OAuth`, `showInFinder`, `AI`, and
  `getFrontmostApplication`.
- Real OS selection/application/preferences providers, permissions, and client
  UI remain future host work.
