# ADR 0048: Normalize measured collection values at the adapter edge

- Status: accepted
- Date: 2026-08-29
- Decision owners: Blast V2 maintainers

## Context

The pinned Raycast corpus exposed several runtime shapes that were valid for
the selected commands but were stricter than the first V2 scene adapter:

- `arabic-keyboard` uses a Grid with 11 columns;
- `text-decorator` uses a Grid content descriptor with an empty tooltip;
- `google-meet` uses `List.Item` icon descriptors of the form
  `{ value: Icon.AddPerson, tooltip }`;
- `create-t3-app` produces a FilePicker default string array containing an
  `undefined` preference value;
- `archiver` produces the numeric `0` from a JSX `files.length && ...`
  conditional; and
- `lucide-icons` composes Grid content through `React.memo`.

The corresponding values are local scene data, not new host capabilities. The
canonical probe recorded 1,324 rendered extensions after these boundaries were
added, up from 1,313 in the previous post-slice run; five structured cases
cleared while three unrelated structured cases remain.

## Decision

- Accept positive safe-integer Grid column counts. The adapter preserves the
  value in the scene; client layout code owns any platform-specific clamping.
- Preserve empty string Grid content tooltips because the Raycast declaration
  requires a string but does not require it to be non-empty.
- Accept the measured `List.Item` icon descriptor with a nullable/optional icon
  value and a string tooltip. Serialize the tooltip as the scene's
  `iconTooltip` property and retain the existing explicit icon-member policy.
- Add only the observed `Icon.AddPerson` member, with its declared
  `add-person-16` value; unknown icon members remain unsupported.
- Ignore exact numeric `0` in collection child positions as the standard JSX
  conditional sentinel. Other numeric children remain invalid.
- Treat React `memo`, `forwardRef`, and `lazy` wrappers as composite elements;
  their resolved children still pass through the existing semantic validation.
- For initial string-array Form values, remove `undefined` entries only when
  every non-undefined entry is a string. Null and other invalid members remain
  rejected, and submitted/runtime wire arrays remain strict string arrays.

## Consequences

- The adapter covers observed collection composition and value shapes without
  widening the transport or granting a new capability.
- `iconTooltip` is now a versioned scene list-item property and must remain
  whitelisted and type-validated by scene consumers.
- Layout, icon rendering, and Form control behavior remain client concerns;
  the adapter only serializes validated semantic values.
- Undefined-value omission is intentionally narrow and applies to initial
  values only, preventing malformed null or heterogeneous arrays from being
  silently accepted.
- Corpus probe runs continue to record unsupported values as structured errors,
  including the three remaining failures that have not yet been attributed to
  this measured boundary.
