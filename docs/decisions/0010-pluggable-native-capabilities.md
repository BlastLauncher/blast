# 0010 — Native behaviour is pluggable; the engine stays platform-free

Status: accepted 2026-10-19; refines 0001 (6) and 0009 (3)

## Decision

1. **The engine core holds no OS-specific behaviour.** It loads, builds and
   runs extensions and brokers capability requests. It never touches the
   clipboard, windows, applications, the file manager, the trash or the
   browser, and it has no `process.platform` branches outside dependency
   installation and process spawning.
2. **Capabilities are a registry the embedder fills.** Handlers are
   registered per engine and can be overridden per extension or per launch,
   by name (`clipboard.copy`, `open.url`, …). Anything unregistered stays
   `denied` (0001). The only handlers the engine supplies itself are
   platform-free and session-scoped: LocalStorage and internal storage, Cache,
   preferences, OAuth token storage and the extension's own AI provider.
   Embedders can replace each of them, for example with their own database.
3. **A capability catalog is the contract.** `packages/protocol` lists every
   capability name with its params/result shape, scope (session or grant) and
   the `@raycast/api` calls that use it. A test fails when the runtime requests
   a name the catalog lacks. Embedders implement against the catalog, and
   `blast serve` forwards catalog requests to them (0009).
4. **One built-in native package: `@blastlauncher/native`.** It is optional
   and separate from the engine, and implements the native capabilities on
   macOS, Windows and Linux (X11 and Wayland): clipboard, open, show in file
   manager, trash, applications and the frontmost application, selected text
   and files, and window management. It uses system tools (`osascript`/`pbcopy`, PowerShell, `xdg-open`,
   `wl-copy`/`xclip`, `gio`, …) through an injectable command runner, with no
   native addons. A missing tool fails that capability with a message naming
   the tool. Embedders register it, wrap it, or skip it.
5. **Reference clients are outside the core.** The `blast` CLI and its
   headless answers, and the TUI's in-memory clipboard, are clients. They
   register handlers like any embedder and may opt into `native`.

## Why

Embedders already own the UI and usually the platform layer, such as an
Electron or Tauri app or a web backend. A slim core with an explicit
capability contract runs anywhere Node runs. Shipping a working native layer
separately keeps "Raycast extensions work out of the box" one registration
away, without forcing it on anyone.

## Consequences

- `cli.ts` and `headless.ts` move out of `packages/host` into a CLI package.
- `docs/capabilities.md` becomes the human view of the catalog.
- Native handlers are tested with a fake command runner; real-OS checks are
  manual or per-platform CI, not `bun run verify`.
