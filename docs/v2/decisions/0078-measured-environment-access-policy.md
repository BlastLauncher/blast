# ADR 0078: Delegate measured environment access policy

- Status: Accepted
- Date: 2026-08-30

## Context

The API-first corpus audit found `environment.canAccess` in roughly 100
extensions. Most guarded the measured `AI` and `BrowserExtension` namespaces;
smaller groups checked `WindowManagement`, `Clipboard`, `getSelectedText`, or
`getSelectedFinderItems`. The compatibility adapter currently returns `false`
for every value, so those extensions cannot take an API branch even when a host
could provide it.

`canAccess` is a policy query, not a capability grant. The adapter should not
infer operating-system permissions or claim that a provider exists. It does
need an explicit host boundary so a future host can answer the query without
changing the Raycast-facing API. Extension bundles also inline their own copy
of the adapter, so object identity is not a reliable way to identify a known
API token.

## Decision

- Add an optional synchronous `canAccess` callback to the compatibility context.
- Delegate `environment.canAccess(api)` to that callback and keep the current
  default-deny result when no callback is configured.
- Mark measured API tokens with a realm-stable `Symbol.for` name and pass the
  resolved name as an optional second callback argument. This lets separately
  bundled adapter copies share policy identity without exposing an enumerable
  implementation property.
- Preserve string arguments as policy names, pass `undefined` for unknown
  object/function values, and validate that a configured provider returns a
  boolean. Provider exceptions remain host errors and are not hidden.

## Boundary

This slice does not grant capabilities, add production AI/browser/desktop
providers, or define consent, permission, or network policy. The default and
the current launcher remain deny-by-default until a host explicitly supplies a
policy callback. Unknown API tokens remain subject to that callback and should
normally be denied.

## Evidence

- The corpus census records `environment.canAccess` usage in approximately 100
  extensions, with AI and BrowserExtension being the dominant measured names.
- The focused `@blastlauncher/raycast-compat` suite passes 86 tests covering
  default denial, string and marked-token identity, callback delegation, and
  rejection of non-boolean policy results.
- The focused corpus diagnostics found no additional adapter-owned gap behind
  the can-access calls; remaining failures are dependency, OAuth/provider,
  malformed-child, or host-policy boundaries.

## Consequences

Guarded Raycast API branches can now be enabled by an explicitly configured
host policy while existing contexts remain secure and behaviorally compatible.
The aggregate corpus counters remain unchanged until a host provider opts into
specific API access; that is intentional and keeps API semantics separate from
provider availability.
