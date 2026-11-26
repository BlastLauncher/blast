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

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
blast_command="$(option @blast-command 'bunx @blastlauncher/tui@next')"
blast_cache_dir="$(option @blast-cache-dir "$HOME/.local/share/blast/tui")"
blast_update_interval="$(option @blast-update-interval 3600)"
blast_theme="$(option @blast-theme system)"
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

# bunx resolves the package metadata on every invocation. Keep the default TUI
# in a local install so only the first launch needs the network; later popups
# execute the cached entrypoint directly and refresh `@next` in the background
# once `@blast-update-interval` seconds have passed. Explicit @blast-command
# values keep their existing behavior.
if [ "$blast_command" = 'bunx @blastlauncher/tui@next' ]; then
  tui_entry="$blast_cache_dir/current/node_modules/@blastlauncher/tui/dist/main.js"
  if [ ! -f "$tui_entry" ]; then
    tui_entry="$blast_cache_dir/node_modules/@blastlauncher/tui/dist/main.js"
  fi
  tui_spec="$blast_cache_dir/.blast-spec"
  if [ ! -f "$tui_entry" ] || [ "$(cat "$tui_spec" 2>/dev/null || true)" != "$blast_command" ]; then
    mkdir -p "$blast_cache_dir"
    printf '%s\n' '{"name":"blast-tmux-cache","private":true,"type":"module"}' > "$blast_cache_dir/package.json"
    message "Installing Blast TUI (first launch)…"
    if ! bun add --cwd "$blast_cache_dir" --exact --no-save '@blastlauncher/tui@next'; then
      message "Could not install Blast TUI; check your network connection"
      exit 0
    fi
    tui_entry="$blast_cache_dir/node_modules/@blastlauncher/tui/dist/main.js"
    printf '%s\n' "$blast_command" > "$tui_spec"
    date +%s > "$blast_cache_dir/.blast-checked"
  else
    case "$blast_update_interval" in
      '' | *[!0-9]*) blast_update_interval=3600 ;;
    esac
    if [ "$blast_update_interval" -gt 0 ]; then
      last_checked="$(cat "$blast_cache_dir/.blast-checked" 2>/dev/null || printf '0')"
      case "$last_checked" in
        '' | *[!0-9]*) last_checked=0 ;;
      esac
      now="$(date +%s)"
      if [ $((now - last_checked)) -ge "$blast_update_interval" ] && [ -x "$script_dir/update-tui.sh" ]; then
        "$script_dir/update-tui.sh" "$blast_cache_dir" "$blast_command" >/dev/null 2>&1 &
      fi
    fi
  fi
  blast_command="bun $(quote "$tui_entry")"
fi

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
