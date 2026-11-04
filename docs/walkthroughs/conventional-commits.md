# Conventional Commits

The `conventional-commits` extension is an offline List of commit prefixes. Each row includes a **Paste in Active App** action, and selecting the first row requests `clipboard.paste` with the `feat:` prefix.

Fetch the pinned corpus source and run the list in the TUI:

```bash
bun run corpus:fetch --extension conventional-commits
bun run tui .cache/raycast-extensions/extensions/conventional-commits index
```

The reproducible Blast check grants its fake paste capability and verifies that the first action requests `clipboard.paste`; it never writes to a real application:

```bash
docs/walkthroughs/checks/conventional-commits.sh
```

Run it through the macOS example with:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/conventional-commits
```

Known limitation: pasting into the active application depends on the embedder's macOS clipboard and frontmost-application capabilities. The list and prefix metadata remain available without those grants.
