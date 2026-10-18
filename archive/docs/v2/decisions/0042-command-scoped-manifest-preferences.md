# ADR 0042: Command-scoped manifest preferences

- Status: accepted
- Date: 2026-08-29

## Context

Raycast manifests can declare preference defaults on an individual command as
well as at the extension level. The pre-slice adapter only carried extension-
level defaults in the trusted descriptor, so `getPreferenceValues()` returned no
`columns` value for commands such as `auto-quit-app` even though the selected
command declared it. Focused diagnostics identified four Grid-column failures
caused by this missing catalog-to-runtime data path.

## Decision

- Parse command-level `commands[].preferences` with the same strict primitive
  and checkbox-default rules used for extension-level preferences.
- Merge extension-level defaults with the selected command's defaults when the
  catalog resolves a descriptor; command-level values take precedence for a
  duplicate name.
- Keep the descriptor's existing primitive-only `preferences` shape. No user
  override store or new transport field is introduced by this slice.

## Consequences

Selected commands now receive the manifest defaults that their Raycast source
expects, including command-specific Grid layout settings. The catalog tests cover
parsing, merging, and precedence, while malformed command preference arrays
remain invalid. User-set overrides remain a future host-owned preference layer.
