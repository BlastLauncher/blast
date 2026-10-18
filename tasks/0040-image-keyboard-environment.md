---
id: "0040"
title: Image, Keyboard and environment completeness
status: doing
milestone: M3
depends: []
---

## Goal

Every non-deprecated `Image.*`, `Color.*`, `Keyboard.*` and `environment.*`
path is covered: image-like normalization (source light/dark, fallback,
mask, tintColor, fileIcon), cross-platform shortcuts, `KeyEquivalent`/
`KeyModifier`, and environment fields (`appearance`, `textSize`,
`canAccess`, `entryPoint*`, `ownerOrAuthorName`).

## Context

- Gaps: non-covered, non-deprecated entries in `compat/raycast-api.json`
  under those prefixes (`Image.ImageLike` alone: 279 extensions).
- Image-likes are serialized into scene props; make the serialized shape
  deterministic and documented (what clients receive for a string, an
  `Icon`, `{ source, tintColor, mask, fallback }`, `{ fileIcon }`, and
  `{ source: { light, dark } }`). Existing tests: `image.test.ts`.
- Keyboard: `keyboard.ts`; `Keyboard.Shortcut` may be `{ modifiers, key }` or
  `{ macOS, Windows }`; scene keeps what the extension passed, plus nothing
  invented. `Keyboard.Shortcut.Common` already exists — check.
- environment (`environment.ts`): values come from the host `init`
  (`packages/protocol`). Headless defaults: `appearance: "dark"`,
  `textSize: "medium"`, `ownerOrAuthorName` from the manifest (`owner` ??
  `author`), `entryPoint*` from command name/mode as Raycast defines them.
  `canAccess(api)` returns `false` for APIs Blast does not provide (AI,
  BrowserExtension today) and `true` otherwise — derive it from the
  implemented-API list rather than hardcoding.
  If the protocol `init` shape changes, update its validation and tests.
- `@covers`, `compat:report`, `fmt`. Parallel workers: Form (0038), List/Grid
  (0039), OAuth (0041).

## Acceptance

- [ ] Runtime tests for each normalization and environment field; protocol
      tests if `init` changed.
- [ ] No non-deprecated path under those prefixes left missing (partials
      explained in Handoff).
- [ ] `bun run verify` passes.

## Out of scope

- Loading images, real system appearance detection.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
