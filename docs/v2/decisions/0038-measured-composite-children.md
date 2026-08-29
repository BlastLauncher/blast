# ADR 0038: Measured composite children

- Status: accepted
- Date: 2026-08-29

## Context

The corpus runtime diagnostics showed that otherwise measured views were
blocked when an `ActionPanel`, `Form`, or one of their collection children was
wrapped in a user-defined React function component or fragment. The React
reconciler can resolve those composite elements into the same semantic scene
nodes, but the adapter rejected them while inspecting the parent component's
raw `props.children`. The existing list-section, grid, and menu-bar mappers
already established this composition pattern.

## Decision

- Accept function components and React fragments in measured action, form,
  dropdown, and tag-picker collection positions, using the existing keyed
  child path so React resolves the composite before scene publication.
- Apply the same allowance to `ActionPanel`, `ActionPanel.Section`,
  `ActionPanel.Submenu`, `List.Item`, `Grid.Item`, `Form`, and their measured
  collection children through the shared mapper.
- Keep raw text, intrinsic DOM elements, and resolved children outside the
  semantic parent/child contract unsupported. Scene validation remains the
  final check after composite resolution.
- Cover the behavior with adapter tests, a real child-process fixture, and the
  corpus probe. Do not add a new protocol message or a host capability.

## Consequences

Normal React composition no longer creates a false compatibility failure for
measured collection trees, while invalid resolved children still fail loudly
with a structured compatibility error. Composite components that depend on
unmeasured Raycast APIs remain unsupported at the point where those APIs are
used.
