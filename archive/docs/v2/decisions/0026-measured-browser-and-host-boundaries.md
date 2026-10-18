# ADR 0026: Measured browser and host-owned boundaries

- Status: accepted
- Date: 2026-08-29

## Context

The next corpus probe group was `Tool`, `BrowserExtension`, `ToastStyle`,
`clearSearchBar`, and `trash`. These names span different compatibility
categories: a type-only tool contract, legacy constants, browser integration,
navigation state, and a destructive filesystem operation. Treating them as one
unbrokered API would weaken the V2 ownership and capability boundaries.

## Decision

- Expose `BrowserExtension.getTabs()` and `BrowserExtension.getContent(options)`
  through `browser-extension.getTabs` and `browser-extension.getContent`.
  Tab results are JSON-decoded and validated; content format, CSS selector, and
  tab ID options are validated before they cross the host boundary.
- Expose `clearSearchBar(options)` through `navigation.clearSearchBar`, with
  the measured `forceScrollToTop` option.
- Expose `trash(pathOrPaths)` through `filesystem.trash`. The adapter accepts
  one or many structural `PathLike` values and sends a JSON array of normalized
  primitive paths.
- Preserve the top-level legacy `ToastStyle` values as uppercase constants
  (`SUCCESS`, `FAILURE`, and `ANIMATED`). The adapter's internal scene style
  remains normalized to its lower-case representation.
- Expose `Tool.Confirmation<T>` as a type-only confirmation callback contract;
  it does not create a runtime capability or provider.
- Corpus and fixture probes use deterministic in-memory providers. Production
  browser permissions, navigation state, trash behavior, audit records, and
  consent remain host/client responsibilities.

## Consequences

- The measured group is available to real Raycast-style TypeScript sources and
  is covered by a child-process fixture and the full corpus probe.
- Browser and filesystem behavior remains explicit, deny-by-default, and
  replaceable by a client provider without coupling the adapter to Electron or
  Node-only APIs.
- Broader browser APIs, action helpers, and runtime Tool behavior remain
  unsupported until corpus measurements justify their own boundaries.
