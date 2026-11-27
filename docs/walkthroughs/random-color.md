# Random Color

Offline Grid command generating ten pastel colors with a color-family
dropdown; **Copy to Clipboard** requests `clipboard.copy` with the hex value.

```bash
bun run corpus:fetch --extension random-color
bun run tui .cache/raycast-extensions/extensions/random-color select-color
```

The headless check grants fake clipboard access and asserts `clipboard.copy`:

```bash
docs/walkthroughs/checks/random-color.sh
```

Run it through the macOS example:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/random-color
```

Limitation: `Paste to Current App` needs `clipboard.paste` and frontmost-app
support from the embedder; the check tests copy only.
