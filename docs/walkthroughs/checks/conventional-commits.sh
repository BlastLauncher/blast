#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
bun run corpus:fetch --extension conventional-commits
output_file=$(mktemp)
trap 'rm -f "$output_file"' EXIT
bun run blast run ".cache/raycast-extensions/extensions/conventional-commits" index \
  --script docs/walkthroughs/checks/conventional-commits.script \
  --grant clipboard.paste --timeout 10000 >"$output_file"
grep -F '# capability clipboard.paste' "$output_file" >/dev/null
