#!/usr/bin/env bash
# Opens the Blast palette in a popup on the client that pressed @blast-key.
# Usage (from the key binding):
#   palette.sh <client_name> <pane_id> <client_width> <client_height>
# The binding passes the client size because `display-message -c` takes no
# client argument in tmux 3.2a.
set -euo pipefail

client="$1"
pane="$2"
client_width="$3"
client_height="$4"

option() {
  local value
  value="$(tmux show-option -gqv "$1")"
  printf '%s' "${value:-$2}"
}

quote() {
  printf "'%s'" "${1//\'/\'\\\'\'}"
}

message() {
  tmux display-message -t "$pane" "blast: $1"
}

# The tmux server often starts before a login shell adds Bun to PATH, so fall
# back to Bun's default install location before giving up.
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
  else
    message "Bun is required to open the palette; install it from https://bun.sh"
    exit 0
  fi
fi

blast_command="$(option @blast-command 'bunx @blastlauncher/tui@next')"
blast_theme="$(option @blast-theme dark)"
blast_builtin="$(option @blast-builtin on)"
blast_config="$(option @blast-config "$HOME/.config/blast/tmux.json")"
width="$(option @blast-popup-width 90)"
height="$(option @blast-popup-height 28)"
if [ "$client_width" -lt 80 ]; then
  width=100%
  height=100%
fi
# A popup larger than the client is refused, so clamp fixed sizes.
if [ "${width%\%}" = "$width" ] && [ "$width" -gt "$client_width" ]; then width=100%; fi
if [ "${height%\%}" = "$height" ] && [ "$height" -gt "$client_height" ]; then height=100%; fi

# The extension splits this into window and session targets; tmux replaces
# `:` and `.` in session names, so the split is unambiguous.
target="$(tmux display-message -p -t "$pane" '#{session_name}:#{window_index}.#{pane_index}')"

extensions=""
for dir in $(option @blast-extensions ''); do
  case "$dir" in "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
  extensions="$extensions $(quote "$dir")"
done

# tmux 3.2 has no `display-popup -e`, so the environment travels in the
# command; a failed start would otherwise close the popup without a trace.
# display-popup uses tmux's default shell, which may be fish or another shell
# with different status-variable syntax. Run this POSIX command explicitly so
# the fallback does not get parsed by the user's interactive shell.
popup="export BLAST_TMUX_TARGET=$(quote "$target") BLAST_THEME=$(quote "$blast_theme") BLAST_TMUX_CONFIG=$(quote "$blast_config") BLAST_TMUX_BUILTIN=$(quote "$([ "$blast_builtin" = on ] && printf 1 || printf 0)") PATH=$(quote "$PATH");"
popup="$popup $blast_command --popup$extensions ||"
popup="$popup tmux display-message -t $(quote "$pane") \"blast: the palette exited with status \$?\""
popup="/bin/sh -c $(quote "$popup")"

tmux display-popup -E -c "$client" -t "$pane" -w "$width" -h "$height" "$popup"
