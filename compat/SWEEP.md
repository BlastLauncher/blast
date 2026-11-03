# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 100 selected extensions and 262 commands (262 command records).
Peak .cache 451.0 MB; wall time 87 s; 180.24 commands/min; 0 resumed command(s).
Rendered means a first scene was published; it does not assert that the command works with live data or actions.
Projected full population: 0.5 h; projected peak 451.0 MB.

## Outcomes

- rendered: 230 command(s)
- completed: 0 command(s)
- capability-denied: 9 command(s)
- sandbox-denied: 6 command(s)
- bundle-failed: 3 command(s)
- bundle-timeout: 0 command(s)
- crashed: 10 command(s)
- network: 4 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 0 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 7 command(s): Cannot convert undefined or null to object
- 6 command(s): Capability denied: storage.get
- 5 command(s): spawnSync /bin/sh EPERM
- 2 command(s): Capability denied: clipboard.copy
- 2 command(s): missing dependencies: swift:..
- 2 command(s): request to https://api.urbandictionary.com/v0/words_of_the_day failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com
- 1 command(s): Cannot read properties of undefined (reading 'length')
- 1 command(s): Capability denied: command.launch
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
- 1 command(s): ENOENT: no such file or directory, scandir '<scratch>/Desktop'
- 1 command(s): Preference "executablePath" needs a scalar "default"
- 1 command(s): request to https://api.buddy.works/workspaces failed, reason: getaddrinfo ENOTFOUND api.buddy.works
- 1 command(s): request to https://api.urbandictionary.com/v0/random failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com
- 1 command(s): spawn EPERM

## Unsupported and denied capabilities

- 6 command(s): storage.get
- 2 command(s): clipboard.copy
- 1 command(s): command.launch

## Primary action probe

230 rendered command(s) were probed through client-core; a denied capability counts as working as far as a headless run can show.
Render-only crash rate 10/262 (3.8%); after the primary action 0/63 dispatched (0.0%); probe time 102.6 ms/dispatched command.

- navigated: 6 command(s)
- scene-changed: 44 command(s)
- capability-requested: 7 command(s)
- no-items-or-content: 154 command(s)
- items-but-no-primary-action: 12 command(s)
- still-loading: 1 command(s)
- no-op: 0 command(s)
- crashed: 0 command(s)
- timeout: 6 command(s)

### Primary action crash causes

- none

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
