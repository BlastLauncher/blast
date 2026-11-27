# Markdown Reference

Ships local Markdown reference topics in a searchable List; **View** pushes a
Detail view with the topic guide. Fetch and run in the TUI:

```bash
bun run corpus:fetch --extension markdown-reference
bun run tui .cache/raycast-extensions/extensions/markdown-reference markdown-reference
```

The check opens the first topic and asserts the Detail contains `Blockquotes`:

```bash
docs/walkthroughs/checks/markdown-reference.sh
```

Run it through the macOS example:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/markdown-reference
```

Limitation: topic data is static, so search and navigation work offline with no
remote refresh.
