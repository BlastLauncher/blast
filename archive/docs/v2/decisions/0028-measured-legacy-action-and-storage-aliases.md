# ADR 0028: Measured legacy action and storage aliases

- Status: accepted
- Date: 2026-08-29

## Context

The next corpus probe group was led by `SubmitFormAction` (11 extensions),
`getLocalStorageItem` (10), `setLocalStorageItem` (9), `ImageMask` (8), and
`PushAction` (8). These names are deprecated Raycast exports, but they are
common enough that missing exports prevent otherwise compatible extensions from
bundling or rendering.

## Decision

- Export `SubmitFormAction` as the measured `Action.SubmitForm` component and
  preserve its generic `SubmitFormActionProps` shape.
- Export `PushAction` as the measured `Action.Push` component. Its React-element
  target is validated before entering the navigation stack; `onPush` runs after
  the push and `onPop` runs when the pushed entry is removed. The stack also
  accepts the optional `onPop` callback on the measured `useNavigation().push`
  boundary.
- Keep the navigation stack in the runtime adapter and expose a global-realm
  proxy in the context default. This lets a bundled extension copy of
  `@raycast/api` reach the bootstrap-owned stack while preserving the normal
  React context path within one module copy.
- Export `ImageMask` as both the deprecated `Image.Mask` type and the same enum
  value object. Mask validation remains at the shared icon serializer.
- Export `getLocalStorageItem` and `setLocalStorageItem` as aliases of
  `LocalStorage.getItem` and `LocalStorage.setItem`. They retain the existing
  `local-storage` capability, extension identity, primitive-value validation,
  and deny-by-default host policy.
- Add one deterministic child-process fixture and update the corpus probe's
  supported-import set. No new capability is introduced by these aliases.

## Consequences

- Legacy action, image, and local-storage imports can use the same measured
  implementation as their modern namespace equivalents.
- Push lifecycle callbacks are observable in the runtime without crossing the
  wire; local-storage side effects still cross the explicit capability broker.
- Bundled TSX commands can use navigation actions even when their API module is
  a separate esbuild copy, while production clients remain responsible for
  navigation presentation and storage policy.
