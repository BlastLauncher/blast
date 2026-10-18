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
Branch/commit: t3/image-keyboard-environment @ f7cf7c6
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, workflow ok, test ok) in 32.0s
Done:
- Image: every non-deprecated Image.* path covered; image.test.ts pins the
  serialized shape for a URL/asset string, an Icon, { fileIcon }, an image
  object ({ source, fallback, mask, tintColor }, light/dark pairs, nulls) and
  asserts the shape is stable across commits.
- Color: color.test.ts covers Color.Raw, Color.Dynamic and Color.ColorLike
  (built-in, literal, light/dark and adjustContrast) crossing the scene as
  authored.
- Keyboard: keyboard.ts types Common against Keyboard.KeyModifier and
  Keyboard.KeyEquivalent and pins the shortcut shapes ({ modifiers, key },
  { macOS, Windows }, plus the deprecated lowercase windows) in scenes.
- environment: init environment gains ownerOrAuthorName (manifest owner ??
  author, host bundle/session), appearance (headless default "dark") and
  textSize ("medium"); the runtime derives entryPointType/Name/Mode from the
  launched command; canAccess(api) returns false exactly for stub values (the
  generated implemented-API list), so AI and BrowserExtension are denied.
- Protocol init validation rejects a missing ownerOrAuthorName and unknown
  appearance/textSize; docs/architecture.md documents both shapes.
Not done / risks:
- Deprecated aliases stay missing: Color.Brown/DynamicColor/ColorLike
  (deprecated), ImageLike/ImageSource/ImageMask types, Environment.theme/
  commandMode/launchContext, top-level KeyEquivalent/KeyModifier and
  KeyboardShortcut / Keyboard.Shortcut.windows. `environment.commandName` is
  still set and tagged (deprecated). No partials remain under these prefixes.
- canAccess is derived from the stub marker rather than an explicit name list;
  any API Blast stubs is denied, not only AI/BrowserExtension.
- No real theme detection (out of scope): appearance/textSize are static.
```
