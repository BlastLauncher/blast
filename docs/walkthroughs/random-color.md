# Random Color

The `random-color` extension is a small offline Grid command. It creates ten pastel color items and offers a dropdown with the color family. Selecting **Copy to Clipboard** sends the selected hex value to `clipboard.copy`.

Fetch the pinned corpus source and open it directly in the TUI:

```bash
bun run corpus:fetch --extension random-color
bun run tui .cache/raycast-extensions/extensions/random-color select-color
```

The headless check uses Blast's fake clipboard grant. It verifies that the Grid action requests `clipboard.copy`; no operating-system clipboard is accessed:

```bash
docs/walkthroughs/checks/random-color.sh
```

The macOS example uses the same extension directory and keeps the capability boundary in the launcher:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/random-color
```

Known limitation: the `Paste to Current App` action needs a `clipboard.paste`/frontmost-application implementation from the embedder. The walkthrough exercises copy, which is deterministic and headless-safe.
