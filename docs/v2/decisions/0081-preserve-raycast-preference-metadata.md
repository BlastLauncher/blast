# ADR 0081: Preserve Raycast preference metadata

- Status: Accepted
- Date: 2026-08-30

## Context

`getPreferenceValues` is imported by 1,957 corpus extensions (60.6%), and the
deprecated `preferences` object remains part of the public Raycast declaration.
Blast currently carries only resolved primitive manifest defaults through the
descriptor. That is enough for the common `getPreferenceValues()` path, but it
causes `preferences.<name>` to lose the declared type, required state, labels,
placeholders, descriptions, and dropdown data.

The local manifest audit found 5,253 preference entries across 1,724 extensions.
All entries have `name`, `type`, `required`, and `description`; the measured
types are `appPicker`, `checkbox`, `dropdown`, `password`, `textfield`, `file`,
and `directory`. Dropdown data is consistently an array of `{ title, value }`
string pairs. Optional metadata is common enough to affect compatibility:
`title` appears on 4,804 entries, `default` on 3,114, `placeholder` on 1,557,
`label` on 1,371, and `data` on 1,021.

## Decision

- Add an optional preference-metadata map to the trusted extension descriptor.
  Each entry preserves the declared name, type, required flag, title,
  description, optional default/value, placeholder, label, and measured
  dropdown data.
- Parse extension-level and command-level declarations in the filesystem
  catalog. Merge metadata by preference name in the same order as values, with
  the selected command overriding extension-level declarations.
- Keep `descriptor.preferences` as the resolved primitive default map used by
  `getPreferenceValues`. Checkbox declarations without a default continue to
  resolve to `false`; preference storage and user overrides remain future host
  work.
- Make the deprecated `preferences` proxy expose every declared metadata entry,
  including entries without a resolved value. Overlay a resolved value when one
  exists, and retain the current inferred metadata for manually-created legacy
  contexts that provide values without declarations.
- Validate the metadata map at the extension contract boundary. Preserve only
  JSON-safe measured preference metadata and dropdown items so the descriptor
  remains transport-safe and independent of React, Electron, and Node APIs.

## Boundary

This slice does not provide a preference store, secure password persistence,
Raycast onboarding UI, platform app-picker resolution, or host-side preference
editing. Platform-specific/object defaults remain metadata until a host policy
can resolve them for the running platform; they must not be guessed on the
ARM64 Linux measurement runner.

## Evidence

- The pinned Raycast declaration defines the seven preference types and the
  metadata fields mirrored here.
- The compatibility census records 1,957 `getPreferenceValues` consumers.
- The local manifest audit found the bounded field and dropdown-data shapes
  described above, making metadata propagation a high-yield adapter slice
  without adding a provider or dependency.

## Consequences

Deprecated preference consumers now regain the declaration-shaped object they
expect, while `getPreferenceValues` remains deterministic and provider-free.
The descriptor grows only by optional, validated manifest metadata; storage,
platform resolution, and preference UI remain visible follow-up boundaries.

## Verification

Contract, catalog, adapter, and child-process e2e tests cover metadata
validation, extension/command merging, no-default declarations, dropdown data,
and resolved-value overlays. The aggregate corpus counters remain unchanged
because this slice adds no dependency or host provider.
