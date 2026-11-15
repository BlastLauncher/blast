#!/usr/bin/env bash
# TPM entry point: binds @blast-key to the Blast palette popup.
set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

option() {
  local value
  value="$(tmux show-option -gqv "$1")"
  printf '%s' "${value:-$2}"
}

# Single-quoted for the shell run-shell starts; `#` is doubled because tmux
# expands formats in the run-shell command before the shell sees it.
quote() {
  local escaped="${1//\'/\'\\\'\'}"
  escaped="${escaped//#/##}"
  printf "'%s'" "$escaped"
}

key="$(option @blast-key C-Space)"
table="$(option @blast-key-table root)"
[ "$key" = off ] && exit 0
case "$table" in
  root | prefix) ;;
  *)
    tmux display-message "blast: @blast-key-table must be root or prefix, not '$table'"
    exit 0
    ;;
esac

tmux bind-key -T "$table" "$key" \
  run-shell -b "$(quote "$plugin_dir/scripts/palette.sh") '#{client_name}' '#{pane_id}' '#{client_width}' '#{client_height}'"
