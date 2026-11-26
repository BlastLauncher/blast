#!/usr/bin/env bash
# Checks npm for a newer `@blastlauncher/tui@next` and stages it into
# `<cache_dir>/releases/<version>`, then atomically switches `<cache_dir>/current`.
# Safe to run in the background while a popup is open: the previous release
# stays on disk until a later refresh, and a lock prevents concurrent installs.
set -euo pipefail

cache_dir="${1:-${HOME}/.local/share/blast/tui}"
spec="${2:-bunx @blastlauncher/tui@next}"
registry="${BLAST_TUI_REGISTRY:-https://registry.npmjs.org}"

if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
  else
    exit 0
  fi
fi

mkdir -p "$cache_dir"
lock_dir="$cache_dir/.updating"
now="$(date +%s)"

acquire_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    printf '%s\n' "$now" > "$lock_dir/ts"
    return 0
  fi
  local started
  started="$(cat "$lock_dir/ts" 2>/dev/null || printf '0')"
  case "$started" in
    '' | *[!0-9]*) started=0 ;;
  esac
  if [ $((now - started)) -ge 600 ]; then
    rm -rf "$lock_dir"
    if mkdir "$lock_dir" 2>/dev/null; then
      printf '%s\n' "$now" > "$lock_dir/ts"
      return 0
    fi
  fi
  return 1
}

if ! acquire_lock; then
  exit 0
fi

stage_dir=""
cleanup() {
  [ -n "$stage_dir" ] && rm -rf "$stage_dir"
  rm -rf "$lock_dir"
}
trap cleanup EXIT

# Record the check attempt up front so offline/failed checks respect the interval.
printf '%s\n' "$now" > "$cache_dir/.blast-checked"

current_pkg="$cache_dir/current/node_modules/@blastlauncher/tui/package.json"
if [ ! -f "$current_pkg" ]; then
  current_pkg="$cache_dir/node_modules/@blastlauncher/tui/package.json"
fi

installed=""
if [ -f "$current_pkg" ]; then
  installed="$(bun -e 'const p = JSON.parse(await Bun.file(process.argv[1]).text()); console.log(p.version ?? "");' "$current_pkg" 2>/dev/null || true)"
fi

latest="$(
  BLAST_REGISTRY="$registry" bun -e '
    const base = (process.env.BLAST_REGISTRY || "https://registry.npmjs.org").replace(/\/+$/, "");
    const res = await fetch(`${base}/@blastlauncher/tui/next`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) process.exit(1);
    const data = await res.json();
    if (typeof data?.version === "string") console.log(data.version);
  ' 2>/dev/null || true
)"

if [ -z "$latest" ] || [ "$latest" = "$installed" ]; then
  exit 0
fi

# Reject anything that could escape `<cache_dir>/releases/<version>`.
case "$latest" in
  */* | *..* | *[!0-9A-Za-z.+-]*) exit 0 ;;
esac

releases_dir="$cache_dir/releases"
target_dir="$releases_dir/$latest"
mkdir -p "$releases_dir"

if [ ! -f "$target_dir/node_modules/@blastlauncher/tui/dist/main.js" ]; then
  stage_dir="$releases_dir/.stage-$$"
  mkdir -p "$stage_dir"
  printf '%s\n' '{"name":"blast-tmux-cache","private":true,"type":"module"}' > "$stage_dir/package.json"
  bun add --cwd "$stage_dir" --registry="$registry" --exact --no-save "@blastlauncher/tui@${latest}" >/dev/null
  rm -rf "$target_dir"
  mv "$stage_dir" "$target_dir"
  stage_dir=""
fi

prev_target=""
if [ -L "$cache_dir/current" ]; then
  prev_target="$(readlink "$cache_dir/current" 2>/dev/null || true)"
fi

ln -sfn "releases/$latest" "$cache_dir/current"
printf '%s\n' "$spec" > "$cache_dir/.blast-spec"

# Keep the active release and the immediately preceding one (in case a popup is
# still open using it); prune anything older.
prev_name="${prev_target#releases/}"
for entry in "$releases_dir"/*; do
  [ -d "$entry" ] || continue
  name="$(basename "$entry")"
  if [ "$name" != "$latest" ] && [ "$name" != "$prev_name" ]; then
    rm -rf "$entry"
  fi
done
