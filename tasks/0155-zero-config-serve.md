---
id: "0155"
title: "Zero-config serve: runnable bin, views by default, drawable icons"
status: doing
milestone: M9
depends: []
---

## Goal

An embedder in any language starts the engine with one command and gets
drawable views without extra opt-ins: `npx @blastlauncher/serve@next` (and
`blast serve`) run the server, views are on by default, and every icon in a
view says what to draw.

## Context

- Decision 0014 points 3–4. Protocol v1 must stay backwards compatible
  (additive only): existing clients that send `views` keep working.
- Bin: `scripts/release/build.ts` gives `@blastlauncher/serve` the bin
  `blast-serve`; check whether `npx @blastlauncher/serve@next` resolves it
  (npm runs the sole bin) and make it so if not. Add `blast serve` to the CLI
  (`packages/cli`) delegating to the serve entry, same flags. `--native` stays
  opt-in, `--dependencies auto` becomes the serve default (0012/decision on
  dependencies; `manual` still selectable).
- Views by default: add `hello.views?: {platform} | false`. When the hello
  has `views`, every `extension.launch` without its own `views` gets them;
  `views: false` keeps scenes only. Launch-level `views` still wins. Default
  when the hello omits it: keep today's behaviour for v1 compatibility, but the
  docs/examples (Go example included) switch to sending `hello.views`.
  Update `packages/protocol/src/embedder.ts`, validators, schema
  (`bun run protocol:schema`), `docs/embedding.md`.
- Drawable icons: `IconView` in `packages/client-core/src/icons.ts` is only
  `{label, tint}`. Extend (additively) with
  `source?: {kind:"builtin", name} | {kind:"url", url} | {kind:"file", path} |
  {kind:"fileIcon", path}` plus `mask?: "circle"|"roundedRectangle"` and
  light/dark variants resolved for the controller's appearance option
  (default light). Relative asset names resolve to absolute paths under the
  extension's `assets/` (the host knows `extensionDir`; pass an `assetsDir`
  through `ControllerOptions`, set by serve and in-process helpers). Keep
  `label` as the text fallback. Expose on rows, grid cells, menu rows, empty
  view, toast-free places only where an icon exists today.

## Acceptance

- [ ] `bun run release:build` + `npm install` the serve tarball in a temp dir
      under `.cache/`, then `npx blast-serve` and `npx @blastlauncher/serve`
      both answer a `hello` with `welcome` (shown in Handoff).
- [ ] `node packages/cli/src/cli.ts serve` speaks the same protocol (test).
- [ ] Serve test: hello with `views` → launch without `views` emits
      `session.view`; hello with `views:false` emits only scenes.
- [ ] client-core tests cover each icon source kind, an asset path, tint,
      mask and a light/dark source.
- [ ] `examples/go-embedder` uses `hello.views`; `bun run example:go` passes
      (if Go is unavailable locally, say so; CI runs it).
- [ ] Schema regenerated; `bun run verify` passes.

## Out of scope

- Root view, launch prompts (0156, 0157); breaking protocol changes; drawing
  icons in the TUI/AppKit clients.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
