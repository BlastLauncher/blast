# Markdown Reference

The `markdown-reference` extension ships its reference content locally. It renders a searchable List of Markdown topics; opening **View** navigates to a Detail view containing the topic's Markdown explanation.

Fetch the pinned corpus source and open the command in the TUI:

```bash
bun run corpus:fetch --extension markdown-reference
bun run tui .cache/raycast-extensions/extensions/markdown-reference markdown-reference
```

The Blast check opens the first topic and asserts that the resulting Detail contains `Blockquotes`:

```bash
docs/walkthroughs/checks/markdown-reference.sh
```

The macOS example can host the same command:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/markdown-reference
```

Known limitation: the extension's topic data is static, so search and navigation work offline but there is no remote document refresh. The check intentionally exercises navigation rather than a private external URL.
