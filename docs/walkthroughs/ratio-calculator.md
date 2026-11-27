# Ratio Calculator

Offline List command: typing an equation such as `1:2 = x:4` in search renders
the computed answer as a list item. Fetch and run in the TUI:

```bash
bun run corpus:fetch --extension ratio-calculator
bun run tui .cache/raycast-extensions/extensions/ratio-calculator calculate-ratio
```

The check enters `1:2 = x:4` and asserts `X = 2.00` appears:

```bash
docs/walkthroughs/checks/ratio-calculator.sh
```

Run it through the macOS example:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/ratio-calculator
```

Limitation: the list starts empty until search receives an equation; copy and
paste actions require clipboard grants.
