# Tmux Palette

This Blast-authored extension provides tmux commands for a popup palette:
one-shot pane, window, session and system commands, plus Raycast views (lists
and forms) to find, move and rename panes, choose sessions and create one, so
nothing depends on tmux's own prompts. The plugin should pass the pane that opened the popup as
`BLAST_TMUX_TARGET` (for example, `TMUX_PANE` captured before `display-popup`).
Commands use that target so they operate on the invoking pane, window, client,
or session instead of the popup pane. When the variable is absent, tmux's
`{last}` target is used, which is the pane active immediately before the popup.
Outside tmux, commands show a `Not inside tmux` failure toast.

Blast withholds the host environment from extensions by default. The Blast TUI
opts in (`inheritEnv`) to pass `TMUX`, `BLAST_TMUX_TARGET` and
`XDG_CONFIG_HOME`; another embedder must do the same to run these commands.
