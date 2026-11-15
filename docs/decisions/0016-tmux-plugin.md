# 0016 — tmux plugin: the terminal client as a popup palette

Status: accepted 2026-11-15; extends 0009 (the TUI is a reference client)

## Decision

1. **The TUI is a published client.** `@blastlauncher/tui` ships on npm with
   the other packages, bin `blast-tui`. It is the only package that requires
   Bun (0009). `blast-tui [--popup] <extensionDir>...` draws the engine root
   over every given extension.
2. **Blast ships a `tmux` Raycast extension** inside `@blastlauncher/tui`
   (`extensions/tmux`). It covers Tmux Palette's built-in commands (panes,
   windows, sessions, reload config; not themes) as ordinary Raycast
   commands: `tmux` via `child_process`, Lists for live panes and sessions,
   Forms instead of tmux prompts, `confirmAlert` for destructive commands,
   `closeMainWindow()` when done. Command names follow Tmux Palette (MIT);
   no code is copied. It has no npm dependencies beyond `@raycast/api`.
3. **Popup mode.** `--popup` exits the TUI when a command calls
   `closeMainWindow()` or a no-view command finishes, and on Esc at the root,
   so `display-popup -E` closes. tmux commands run from inside the popup
   against the client that opened it (`TMUX` env, target `{last}` pane).
4. **The plugin lives in its own small repo** (`BlastLauncher/tmux-blast`)
   because TPM clones the whole repository. Its source of truth and tests
   live here in `examples/tmux-plugin/`; the orchestrator copies released
   versions to that repo. The `.tmux` script binds `@blast-key` (default
   `C-Space`, `off` to skip) to `display-popup -E` running
   `bunx @blastlauncher/tui@next --popup` with the built-in `tmux` extension
   plus `@blast-extensions` (space-separated directories).

## Why

tmux users want a Raycast-style palette inside the terminal; Blast already
has a full Raycast client in the TUI, so the palette is the engine plus a
first-party extension, and every other Raycast extension comes for free.

## Consequences

- Popup start-up time matters: the TUI caches bundles and installs.
- CI installs tmux and drives a real, isolated tmux server (`tmux -L`).
