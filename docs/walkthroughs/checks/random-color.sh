#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
bun run corpus:fetch --extension random-color
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
bun run blast run ".cache/raycast-extensions/extensions/random-color" select-color \
  --script docs/walkthroughs/checks/random-color.script \
  --grant clipboard.copy --timeout 10000 >"$output_file"
grep -F '# capability clipboard.copy' "$output_file" >/dev/null
