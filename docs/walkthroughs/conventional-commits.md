# Conventional Commits

Offline List of commit prefixes; **Paste in Active App** requests
`clipboard.paste` with `feat:`. Fetch and run in the TUI:

```bash
bun run corpus:fetch --extension conventional-commits
bun run tui .cache/raycast-extensions/extensions/conventional-commits index
```

The headless check grants fake paste and asserts `clipboard.paste`:

```bash
docs/walkthroughs/checks/conventional-commits.sh
```

Run it through the macOS example:

```bash
swift run --package-path examples/macos-launcher BlastLauncher .cache/raycast-extensions/extensions/conventional-commits
```

Limitation: pasting into the active app requires the embedder's macOS clipboard
and frontmost-app grants; the list works without them.
