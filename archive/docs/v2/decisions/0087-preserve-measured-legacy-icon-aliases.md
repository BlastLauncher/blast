# ADR 0087: Preserve measured legacy icon aliases

- Status: Accepted
- Date: 2026-08-31

## Context

The binding-aware audit of the pinned Raycast extension corpus resolved API
imports before counting member access. It found two concrete runtime members
that the adapter does not currently publish:

- `Icon.Safari`, used three times by `schoology` for browser actions;
- `Icon.Application`, used once by `system-information` for a process-list
  item.

The other apparent gaps from the audit are type-only namespace paths or
dynamic `preferences.<key>` properties, both of which are already handled by
the adapter's public typing/proxy behavior. The pinned declaration and sampled
public `@raycast/api` archives do not define these two icon names, and the
current official icon list does not expose them. Their original opaque string
identifiers therefore cannot be recovered as declaration-backed values.

## Decision

- Publish `Icon.Safari` as the explicit legacy alias value
  `"globe-01-16"`, the current declaration-backed globe glyph.
- Publish `Icon.Application` as the explicit legacy alias value
  `"app-window-16"`, the current declaration-backed application-window glyph.
- Keep both aliases in the adapter's explicit icon object and `IconName` type;
  do not add an open-ended property fallback.
- Register the existing globe asset in the Electron icon map so the chosen
  browser alias remains drawable when the client consumes the scene.

These are semantic compatibility aliases, not claims about the removed
Raycast enum values. The values are deliberately chosen from the current
drawable icon vocabulary, preserving the intent of the two observed call
sites without adding a new asset or transport field.

## Boundary

This slice changes only the compatibility adapter's exported constants and the
client's existing icon lookup table. It adds no scene property, capability,
transport message, or host provider. Unknown icon names remain unsupported,
and image loading, tinting, and broader client icon coverage remain separate
work.

## Evidence

- The pinned corpus contains exactly four API-bound accesses across two
  extensions: three `Icon.Safari` accesses in `schoology` and one
  `Icon.Application` access in `system-information`.
- A binding-aware scan parsed all 34,601 corpus source files without parse
  errors; type-only namespace paths and dynamic preference keys were excluded
  from the concrete runtime gap.
- Public `@raycast/api` versions sampled from the 0.65/0.71, 1.x, and 2.1
  release lines contain neither member in their `Icon` declarations or
  package archives.
- The workspace already carries `globe-01-16.svg` and `app-window-16.svg`,
  and the adapter publishes the corresponding current `Icon.Globe` and
  `Icon.AppWindow` values.

## Consequences

The two measured corpus commands no longer receive `undefined` for their
legacy icon constants, while the compatibility surface remains explicit and
reviewable. The alias choice is visible in the scene as a current drawable
identifier; if future evidence recovers the historical IDs, that policy can
be revised in a focused compatibility change.

## Verification

- The adapter suite passes 95/95 tests, including both aliases and their
  serialized scene values.
- The existing `globe-01-16.svg` asset is registered in the Electron client;
  the client typecheck passes and its lint completes with only pre-existing
  warnings.
- The bounded serial probe reports `staticUnsupportedApis: []` for both
  `schoology` and `system-information`; both stop at the existing
  `dependency_unavailable` boundary on the ARM64 Linux runner.
- The full V2 suite passes across 17 packages, including all 41 end-to-end
  fixtures, and the formatter check passes.
- Aggregate corpus counters remain unchanged because this is a constant and
  existing-asset alias slice.
