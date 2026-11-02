# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 100 selected extensions and 262 commands (262 command records).
Peak .cache 450.9 MB; wall time 88 s; 179.57 commands/min; 0 resumed command(s).
Rendered means a first scene was published; it does not assert that the command works with live data or actions.
Projected full population: 0.5 h; projected peak 450.9 MB.

## Outcomes

- rendered: 247 command(s)
- completed: 0 command(s)
- capability-denied: 4 command(s)
- sandbox-denied: 5 command(s)
- bundle-failed: 3 command(s)
- bundle-timeout: 0 command(s)
- crashed: 2 command(s)
- network: 1 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 0 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 5 command(s): spawnSync /bin/sh EPERM
- 2 command(s): Capability denied: clipboard.copy
- 2 command(s): missing dependencies: swift:..
- 1 command(s): Capability denied: command.launch
- 1 command(s): Capability denied: storage.get
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
- 1 command(s): ENOENT: no such file or directory, scandir '<scratch>/Desktop'
- 1 command(s): Preference "executablePath" needs a scalar "default"
- 1 command(s): request to https://api.urbandictionary.com/v0/words_of_the_day failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com

## Unsupported and denied capabilities

- 2 command(s): clipboard.copy
- 1 command(s): command.launch
- 1 command(s): storage.get

## Primary action probe

247 command(s) dispatched through client-core; a denied capability counts as working as far as a headless run can show.
Render-only crash rate 0.0%; after the primary action 0.0%; added runtime 2.7 ms/command.

- navigated: 3 command(s)
- scene-changed: 51 command(s)
- capability-requested: 6 command(s)
- no-primary-action: 187 command(s)
- no-op: 0 command(s)
- crashed: 0 command(s)
- timeout: 0 command(s)

### Primary action crash causes

- none

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
