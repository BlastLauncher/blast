# tmux-blast

A Raycast-style command palette for tmux. Press <kbd>Ctrl</kbd>+<kbd>Space</kbd>
and the [Blast](https://github.com/BlastLauncher/blast) terminal client opens in
a popup with tmux commands: split, close, zoom and swap panes; create, switch
and close windows; switch, detach and kill sessions; reload the config. Pick
one and it runs against the pane you pressed the key in, then the popup
closes. Any Raycast extension directory you add shows up in the same list.

## Requirements

- tmux 3.2 or later (`display-popup`)
- [Bun](https://bun.sh) on the tmux server's `PATH`, or in `~/.bun/bin`.
  Without it the key shows a tmux message instead of opening the popup.

The palette runs `bunx @blastlauncher/tui@next`, so the first popup takes a
moment while Bun downloads the package.

## Install

With [TPM](https://github.com/tmux-plugins/tpm), add to `~/.tmux.conf`:

```tmux
set -g @plugin 'BlastLauncher/tmux-blast'
```

then press <kbd>prefix</kbd> <kbd>I</kbd>.

Manually:

```sh
git clone --depth 1 https://github.com/BlastLauncher/tmux-blast ~/.tmux/plugins/tmux-blast
```

```tmux
run-shell ~/.tmux/plugins/tmux-blast/blast.tmux
```

Set options before the `@plugin` / `run-shell` line, then reload tmux
(`tmux source-file ~/.tmux.conf`).

## Options

| Option                | Default                        | Meaning                                                                    |
| --------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| `@blast-key`          | `C-Space`                      | Key that opens the palette; `off` binds nothing.                           |
| `@blast-key-table`    | `root`                         | `root` (no prefix) or `prefix` (press the tmux prefix first).              |
| `@blast-extensions`   | _(none)_                       | Space-separated Raycast extension directories to list as well (`~/` ok).   |
| `@blast-popup-width`  | `90`                           | Popup columns, or a percentage such as `80%`.                              |
| `@blast-popup-height` | `28`                           | Popup rows, or a percentage.                                               |
| `@blast-command`      | `bunx @blastlauncher/tui@next` | Command that starts the Blast TUI; `--popup` and the extensions are added. |
| `@blast-theme`        | `dark`                         | `dark`, `light`, or `mono` palette colours.                                |
| `@blast-builtin`      | `on`                           | Set to `off` to hide the builtin tmux commands.                            |
| `@blast-config`       | `~/.config/blast/tmux.json`    | Persistent extension and builtin state.                                    |
| `@blast-cache-dir`    | `~/.local/share/blast/tui`     | Local cached TUI install used by the default command.                      |

Below 80 columns the popup fills the client; a fixed size larger than the
client does too. `C-Space` in the root table shadows it for programs inside
tmux (for example Emacs `set-mark`); pick another key or use
`set -g @blast-key-table prefix` if you need it.

```tmux
set -g @blast-key 'M-p'
set -g @blast-extensions '~/src/my-raycast-extension'
set -g @blast-theme light
set -g @plugin 'BlastLauncher/tmux-blast'
```

## How it works

`blast.tmux` binds the key to `run-shell -b scripts/palette.sh`, which checks
for Bun and opens `display-popup -E` running `@blast-command --popup`. The
popup exports `BLAST_TMUX_TARGET` (`session:window.pane` of the pane the key was
pressed in), so commands act on that pane rather than on the popup. The Blast
TUI exits when a command finishes or on <kbd>Esc</kbd>, which closes the popup.

## Development

This directory is the source of truth; `BlastLauncher/tmux-blast` receives
released copies. To run it against a checkout of the Blast repository:

```tmux
set -g @blast-command 'bun /path/to/blast/packages/tui/src/main.tsx'
run-shell /path/to/blast/examples/tmux-plugin/blast.tmux
```

`bun run example:tmux:e2e` in the Blast repository drives real, isolated tmux
servers (`tmux -L`) through the key, the popup and a split.

## Credits

The palette also includes **Install Raycast Extension** and **Manage Blast
Extensions**. Install searches the official `raycast/extensions` catalog and
stores sparse checkouts under `~/.local/share/blast/extensions`; enablement,
removal and the builtin tmux toggle are stored in `@blast-config`.

Use `Ctrl-P`/`Ctrl-K` to move up and `Ctrl-N`/`Ctrl-J` to move down in lists.
`Ctrl-A` opens the action panel; `Ctrl-P` still opens a dropdown when the
current command exposes one.

The command list and names follow the built-in commands of
[Tmux Palette](https://github.com/eduwass/tmux-palette) (MIT); no code is
copied. Licensed MIT, see [LICENSE](LICENSE).
