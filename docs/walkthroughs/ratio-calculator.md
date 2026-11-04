# Ratio Calculator

The `ratio-calculator` extension is an offline List command. Its search field accepts equations such as `1:2 = x:4` and renders the computed answer as a list item.

Fetch the pinned corpus source and run the command in the TUI:

```bash
bun run corpus:fetch --extension ratio-calculator
bun run tui .cache/raycast-extensions/extensions/ratio-calculator calculate-ratio
```

The reproducible Blast check enters `1:2 = x:4` and asserts that the result is `X = 2.00`:

```bash
docs/walkthroughs/checks/ratio-calculator.sh
```

Launch the same command from the macOS example with:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/ratio-calculator
```

Known limitation: the command starts with an empty answer until a search value is supplied; this walkthrough provides the input through the headless script. Copy and paste actions in the result require the corresponding macOS capability grants.
