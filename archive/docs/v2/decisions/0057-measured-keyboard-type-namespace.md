# ADR 0057: Expose the measured Keyboard type namespace

- Status: accepted
- Date: 2026-08-30
- Decision owners: Blast V2 maintainers

## Context

The corpus uses `Keyboard.Shortcut` in 588 extensions, including the runtime
constants under `Keyboard.Shortcut.Common`. The adapter already exposed those
values and top-level `ShortcutLike`, `KeyModifier`, `KeyEquivalent`, and
`KeyboardShortcut` aliases, but it did not publish the declaration-shaped
`Keyboard.Shortcut`, `Keyboard.KeyModifier`, and `Keyboard.KeyEquivalent`
namespace types.

## Decision

- Merge a type-only `Keyboard` namespace with the existing runtime constant.
- Alias its shortcut and key types to the validated compatibility shapes while
  retaining the top-level legacy aliases and `Keyboard.Shortcut.Common` values.
- Make no scene or host changes; shortcut values continue to be normalized at
  the existing action boundary.

## Consequences

- TypeScript extensions can use the official nested Keyboard spellings without
  source changes or compatibility shims.
- Runtime shortcut behavior and validation remain unchanged.

---
