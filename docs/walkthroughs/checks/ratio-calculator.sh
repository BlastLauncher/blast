#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
bun run corpus:fetch --extension ratio-calculator
bun run blast run ".cache/raycast-extensions/extensions/ratio-calculator" calculate-ratio \
  --script docs/walkthroughs/checks/ratio-calculator.script --timeout 10000
