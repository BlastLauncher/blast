# ADR 0024: Measured Finder and frontmost application boundaries

- Status: accepted
- Date: 2026-08-29

## Context

After the desktop-discovery slice, the pinned corpus probe still identified
`getSelectedFinderItems` (135 extensions), `showInFinder` (116), and
`getFrontmostApplication` (87) as the leading static blockers. The related
`FileSystemItem` type appeared in 10 extensions. These APIs return or act on
host-owned desktop state and must not make the compatibility adapter depend on
Finder, AppKit, or Node filesystem APIs.

## Decision

- Route `getSelectedFinderItems()` through `finder.selectedItems` with no
  arguments. The host returns a JSON-encoded array; the adapter validates every
  item and exposes the measured `FileSystemItem` shape with a required non-empty
  `path`.
- Route `showInFinder(path)` through `finder.show`. The adapter normalizes the
  structural `PathLike` union (`string`, `URL`, or `Uint8Array`) to one string
  primitive before crossing the capability boundary.
- Route `getFrontmostApplication()` through `application.frontmost`. The host
  returns a JSON-encoded object, and the adapter validates the existing
  `Application` shape (`name` and `path` required; localized name, bundle ID,
  and Windows App ID optional).
- Treat `FileSystemItem` as a type-only compatibility export. Keep all
  selection, reveal, and frontmost-application behavior behind explicit
  capability grants and providers.
- Add deterministic providers to the corpus probe and child-process fixtures.
  Production OS providers, consent, and audit records remain host/client work.

## Consequences

- Finder-oriented commands can receive selected paths, reveal output paths, and
  inspect the frontmost application through validated runtime calls.
- The protocol remains primitive-only: structured results are JSON strings and
  paths are normalized strings. The adapter remains independent of Node-only
  runtime APIs.
- The pinned corpus probe increased end-to-end renders from 484 to 520
  extensions (14.98% to 16.09%); renderable-command coverage increased from
  16.60% to 17.84%.
- The next static leaders are `OAuth`, `AI`, `updateCommandMetadata`, `Tool`,
  and `BrowserExtension`. Real Finder/frontmost providers and OS-specific
  failure semantics remain future host work.
