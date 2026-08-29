# ADR 0030: Measured legacy types, preferences, and environment access

- Status: accepted
- Date: 2026-08-29

## Context

The next corpus probe group contained the named imports `preferences`,
`Preferences`, `Navigation`, `KeyEquivalent`, `randomId`, `Environment`, and
`FormValue`. The pinned Raycast declarations also expose the deprecated
`FormValues`, `KeyboardShortcut`, and `ImageLike` aliases. The corpus uses
`preferences.<name>.value` at module scope, reads properties such as
`environment.appearance` and `environment.assetsPath`, and calls `randomId()`
for list keys and generated identifiers.

Blast's V2 command descriptor currently carries resolved primitive preference
values and does not yet carry the full manifest preference metadata or a host
permission query. The existing adapter also exposed a callable
`environment()` helper used by earlier fixtures.

## Decision

- Export the official preference metadata types and expose `preferences` as a
  live, identity-scoped view of the configured descriptor. Each resolved value
  is presented through the legacy `.value` field; metadata not yet present in
  the V2 descriptor uses stable defaults (`required: false`, the preference
  name as title, empty description, and value-based text/checkbox/dropdown
  type inference).
- Export the official `Navigation` shape alongside the existing
  `NavigationApi`, and export the pinned `FormValue` union including numeric
  and numeric-array values. Keep scene wire validation limited to the measured
  control codecs.
- Export the official `KeyEquivalent`, `FormValues`, `KeyboardShortcut`, and
  `ImageLike` aliases, and implement `randomId` as a process-local monotonic
  identifier generator suitable for React keys and local IDs.
- Expose `environment` as a live property object with the official fields while
  retaining the callable form for compatibility with existing Blast fixtures.
  Asset and support paths derive from the extension root when available;
  appearance/text-size and entry-point metadata use deterministic adapter
  defaults until the host supplies them. `canAccess` remains deny-by-default
  until synchronous host permission state is available.
- Add the names and behavior to the corpus probe and cover direct preference,
  environment-property, helper-ID, and type-alias usage in both real and
  catalog copies of the `coverage-next` fixture.

## Consequences

- The named preference, navigation, environment, form-value, keyboard, image
  type, and helper blockers are removed from static compatibility accounting.
- Older extensions that read `preferences.<name>.value` can initialize from
  manifest defaults without a new capability request. Full editable preference
  metadata and user overrides remain future catalog/host work.
- Existing callable `environment()` consumers continue to work while modern
  property access is supported. Permission-gated APIs remain safe by default.
- The corpus probe increases end-to-end renders from 704 to 740 of 3,231
  extensions. `WindowManagement` is now the next named capability boundary;
  dynamic and namespace imports remain intentionally unimplemented.
