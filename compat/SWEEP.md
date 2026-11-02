# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 100 selected extensions and 288 commands (288 command records).
Peak .cache 533.3 MB; wall time 113 s; 152.42 commands/min; 0 resumed command(s).
Projected full population: 0.6 h; projected peak 533.3 MB.

## Outcomes

- rendered: 176 command(s)
- completed: 0 command(s)
- capability-denied: 3 command(s)
- bundle-failed: 104 command(s)
- bundle-timeout: 0 command(s)
- crashed: 5 command(s)
- network: 0 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 0 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 104 command(s): bundle-failed
- 4 command(s): Command failed: chmod +x <path> chmod: Unable to change file mode on <path> Operation not permitted
- 1 command(s): Capability denied: clipboard.copy
- 1 command(s): Capability denied: command.launch
- 1 command(s): Capability denied: storage.get
- 1 command(s): ENOENT: no such file or directory, open '<path>

## Unsupported and denied capabilities

- 1 command(s): clipboard.copy
- 1 command(s): command.launch
- 1 command(s): storage.get

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
