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

# Read every option and pane/server coordinate in one tmux IPC roundtrip.
us=$'\x1f'
meta="$(tmux display-message -p -t "$pane" \
  "#{@blast-command}${us}#{@blast-cache-dir}${us}#{@blast-update-interval}${us}#{@blast-theme}${us}#{@blast-builtin}${us}#{@blast-config}${us}#{@blast-popup-width}${us}#{@blast-popup-height}${us}#{@blast-extensions}${us}#{@blast-daemon}${us}#{session_name}:#{window_index}.#{pane_index}${us}#{pid}${us}#{socket_path}${us}END")"
IFS="$us" read -r \
  blast_command blast_cache_dir blast_update_interval blast_theme blast_builtin \
  blast_config width height blast_extensions blast_daemon target outer_pid outer_socket _end \
  <<< "$meta"

blast_command="${blast_command:-bunx @blastlauncher/tui@next}"
blast_cache_dir="${blast_cache_dir:-$HOME/.local/share/blast/tui}"
blast_update_interval="${blast_update_interval:-3600}"
blast_theme="${blast_theme:-system}"
blast_builtin="${blast_builtin:-on}"
blast_config="${blast_config:-$HOME/.config/blast/tmux.json}"
width="${width:-90}"
height="${height:-28}"
blast_daemon="${blast_daemon:-on}"

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
resolved_release=""
if [ "$blast_command" = 'bunx @blastlauncher/tui@next' ]; then
  tui_entry="$blast_cache_dir/current/node_modules/@blastlauncher/tui/dist/main.js"
  if [ -L "$blast_cache_dir/current" ]; then
    resolved_release="$(readlink "$blast_cache_dir/current" 2>/dev/null || true)"
  fi
  if [ ! -f "$tui_entry" ]; then
    tui_entry="$blast_cache_dir/node_modules/@blastlauncher/tui/dist/main.js"
    resolved_release="legacy"
  fi
  tui_spec="$blast_cache_dir/.blast-spec"
  if [ ! -f "$tui_entry" ] || [ "$(cat "$tui_spec" 2>/dev/null || true)" != "$blast_command" ]; then
    mkdir -p "$blast_cache_dir"
    printf '%s\n' '{"name":"blast-tmux-cache","private":true,"type":"module"}' > "$blast_cache_dir/package.json"
    message "Installing Blast TUI (first launch)…"
    if ! bun add --no-cache --cwd "$blast_cache_dir" --exact --no-save '@blastlauncher/tui@next'; then
      message "Could not install Blast TUI; check your network connection"
      exit 0
    fi
    tui_entry="$blast_cache_dir/node_modules/@blastlauncher/tui/dist/main.js"
    resolved_release="legacy"
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

extensions=""
for dir in $blast_extensions; do
  case "$dir" in "~/"*) dir="$HOME/${dir#"~/"}" ;; esac
  extensions="$extensions $(quote "$dir")"
done

builtin_flag="$( [ "$blast_builtin" = on ] && printf 1 || printf 0 )"

run_oneshot() {
  # tmux 3.2 has no `display-popup -e`, so the environment travels in the
  # command; a failed start would otherwise close the popup without a trace.
  # display-popup uses tmux's default shell, which may be fish or another shell
  # with different status-variable syntax. Run this POSIX command explicitly so
  # the fallback does not get parsed by the user's interactive shell.
  local popup
  popup="export BLAST_TMUX_TARGET=$(quote "$target") BLAST_THEME=$(quote "$blast_theme") BLAST_TMUX_CONFIG=$(quote "$blast_config") BLAST_TMUX_BUILTIN=$(quote "$builtin_flag") PATH=$(quote "$PATH");"
  popup="$popup $blast_command --popup$extensions ||"
  popup="$popup tmux display-message -t $(quote "$pane") \"blast: the palette exited with status \$?\""
  tmux display-popup -E -c "$client" -t "$pane" -w "$width" -h "$height" /bin/sh -c "$popup"
}

if [ "$blast_daemon" != on ] || [ -z "$outer_pid" ]; then
  run_oneshot
  exit 0
fi

# Warm daemon mode: keep one `blast-tui --popup-daemon` running inside a
# private tmux server socket keyed by this outer tmux server PID so popups
# attach in ~15-20 ms without polluting the user's tmux sessions.
outer_tmux="${TMUX:-${outer_socket},${outer_pid},0}"
runtime_root="${XDG_RUNTIME_DIR:-/tmp}/blast-tmux-$(id -u)"
daemon_dir="$runtime_root/p-$outer_pid"
daemon_sock="$daemon_dir/popup.sock"
daemon_pid_file="$daemon_dir/daemon.pid"
daemon_key_file="$daemon_dir/daemon.key"
daemon_target_file="$daemon_dir/target"

(umask 077 && mkdir -p "$daemon_dir")
printf '%s\n' "$target" > "$daemon_dir/.target.$$"
mv -f "$daemon_dir/.target.$$" "$daemon_target_file"

daemon_key="v2${us}${blast_command}${us}${resolved_release}${us}${blast_theme}${us}${builtin_flag}${us}${blast_config}${us}${extensions}"
stored_key="$(cat "$daemon_key_file" 2>/dev/null || true)"
daemon_pid="$(cat "$daemon_pid_file" 2>/dev/null || true)"

# Fast path: warm daemon already running with matching config/version.
if [ "$stored_key" = "$daemon_key" ] && [ -n "$daemon_pid" ] && [ -S "$daemon_sock" ] \
   && kill -USR1 "$daemon_pid" 2>/dev/null; then
  if tmux display-popup -E -c "$client" -t "$pane" -w "$width" -h "$height" \
       env -u TMUX tmux -S "$daemon_sock" attach-session -t blast; then
    exit 0
  fi
fi

# Cold start or config/version upgrade: recycle any stale inner server and start fresh.
TMUX= tmux -S "$daemon_sock" kill-server 2>/dev/null || true
rm -f "$daemon_pid_file" "$daemon_sock"
printf '%s' "$daemon_key" > "$daemon_key_file"

init_w="$width"
init_h="$height"
if [ "${init_w%\%}" != "$init_w" ]; then init_w="$client_width"; fi
if [ "${init_h%\%}" != "$init_h" ]; then init_h="$client_height"; fi

daemon_cmd="export BLAST_OUTER_TMUX=$(quote "$outer_tmux") BLAST_OUTER_PID=$(quote "$outer_pid") BLAST_POPUP_SOCKET=$(quote "$daemon_sock") BLAST_POPUP_PID_FILE=$(quote "$daemon_pid_file") BLAST_TMUX_TARGET_FILE=$(quote "$daemon_target_file") BLAST_THEME=$(quote "$blast_theme") BLAST_TMUX_CONFIG=$(quote "$blast_config") BLAST_TMUX_BUILTIN=$(quote "$builtin_flag") PATH=$(quote "$PATH");"
daemon_cmd="$daemon_cmd exec $blast_command --popup-daemon$extensions"

# Disable VT100 startup queries (`XT@` + non-CSI `clear` prefix) on the private
# inner server: an outer tmux popup never answers every startup query (e.g.
# OSC 10/11 / Kitty graphics), which otherwise causes tmux's tty-keys.c to
# override `escape-time` to 500 ms for the first 5 s of every attach.
if TMUX= tmux -f /dev/null -S "$daemon_sock" \
     new-session -d -s blast -x "$init_w" -y "$init_h" /bin/sh -c "$daemon_cmd" \; \
     set -g status off \; \
     set -s escape-time 0 \; \
     set -g prefix None \; \
     unbind-key -a \; \
     set -g window-size latest \; \
     set -g default-terminal tmux-256color \; \
     set -sa terminal-overrides ',*:Tc:XT@:clear=\r\E[H\E[2J' \; \
     set -g set-titles off 2>/dev/null; then
  if tmux display-popup -E -c "$client" -t "$pane" -w "$width" -h "$height" \
       env -u TMUX tmux -S "$daemon_sock" attach-session -t blast \
     && { [ -f "$daemon_pid_file" ] || TMUX= tmux -S "$daemon_sock" has-session -t blast 2>/dev/null; }; then
    exit 0
  fi
  TMUX= tmux -S "$daemon_sock" kill-server 2>/dev/null || true
  rm -f "$daemon_pid_file" "$daemon_sock"
fi

# Graceful fallback for older @blastlauncher/tui releases that predate --popup-daemon.
run_oneshot
