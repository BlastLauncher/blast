#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
bun run corpus:fetch --extension markdown-reference
bun run blast run ".cache/raycast-extensions/extensions/markdown-reference" markdown-reference \
  --script docs/walkthroughs/checks/markdown-reference.script --timeout 10000
