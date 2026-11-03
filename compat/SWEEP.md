# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 1939 selected extensions and 5759 commands (5759 command records).
Peak .cache 1498.6 MB; wall time 227 s; 1523.17 commands/min; 5443 resumed command(s).
Rendered means a first scene was published; it does not assert that the command works with live data or actions.
Projected full population: 0.1 h; projected peak 1498.6 MB.

## Outcomes

- rendered: 4879 command(s)
- completed: 27 command(s)
- capability-denied: 451 command(s)
- sandbox-denied: 59 command(s)
- bundle-failed: 170 command(s)
- bundle-timeout: 0 command(s)
- crashed: 157 command(s)
- network: 14 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 2 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 266 command(s): Capability denied: storage.get
- 117 command(s): Capability denied: open.url
- 85 command(s): An unknown Component is an async Client Component. Only Server Components can be async at the moment. This error is often caused by accidentally adding `'use client'` to a module that was originally written for the server.
- 82 command(s): missing dependencies: swift:..
- 47 command(s): spawn EPERM
- 33 command(s): missing dependencies: rust:..
- 23 command(s): Invalid URL
- 15 command(s): Capability denied: oauth.tokens.get
- 14 command(s): Capability denied: clipboard.copy
- 13 command(s): Capability denied: storage.all
- 13 command(s): Preference "terminalApp" needs a scalar "default"
- 10 command(s): spawnSync /bin/sh EPERM
- 9 command(s): missing dependencies: @/lib
- 9 command(s): missing dependencies: ws
- 8 command(s): Capability denied: storage.set
- 7 command(s): Cannot convert undefined or null to object
- 6 command(s): Cannot read properties of undefined (reading 'length')
- 6 command(s): Capability denied: open.path
- 5 command(s): missing dependencies: @/hooks
- 5 command(s): missing dependencies: undici
- 4 command(s): Capability denied: clipboard.paste
- 4 command(s): Capability denied: storage.remove
- 4 command(s): ENOENT: no such file or directory, scandir '<scratch>/Library/Application Support/zen/Profiles'
- 3 command(s): Build failed with # error: src/hooks/useHistorySearch.tsx:#:#: ERROR: [plugin: blast-dependencies] Cannot find package '@raycast/utils' imported from <repo>/p…
- 3 command(s): Cannot read properties of undefined (reading 'trim')
- 3 command(s): fetch failed
- 3 command(s): Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
- 2 command(s): Capability denied: command.launch
- 2 command(s): ENOENT: no such file or directory, open '<scratch>/bundle/package.json'
- 2 command(s): missing dependencies: @/utils
- 2 command(s): missing dependencies: rust:.., swift:..
- 2 command(s): Preference "menu_bar_icon_only" needs a scalar "default"
- 2 command(s): request to https://api.urbandictionary.com/v0/words_of_the_day failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com
- 2 command(s): request to https://www.gov.uk/bank-holidays.json failed, reason: getaddrinfo ENOTFOUND www.gov.uk
- 2 command(s): Unable to get application list
- 1 command(s): Cannot read properties of undefined (reading 'articles')
- 1 command(s): Cannot read properties of undefined (reading 'data')
- 1 command(s): Cannot read properties of undefined (reading 'read')
- 1 command(s): Cannot read properties of undefined (reading 'replace')
- 1 command(s): Cannot read properties of undefined (reading 'results')
- 1 command(s): Cannot read properties of undefined (reading 'split')
- 1 command(s): Cannot read properties of undefined (reading 'sports')
- 1 command(s): Capability denied: browser.tabs
- 1 command(s): Capability denied: clipboard.clear
- 1 command(s): coast CLI not found. Install Coast and make sure the app is running, or set the Coast Binary Path preference.
- 1 command(s): Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object.
- 1 command(s): ENOENT: no such file or directory, lstat '<scratch>/.config/valet/valet.sock'
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/Library/Application Support/obsidian/obsidian.json'
- 1 command(s): ENOENT: no such file or directory, open '~/Documents/#-#-#.md'
- 1 command(s): ENOENT: no such file or directory, scandir '<scratch>/Desktop'
- 1 command(s): LocalStorage.setItem: value must be a string, number or boolean
- 1 command(s): missing dependencies: @/components
- 1 command(s): missing dependencies: @/components, @/hooks, @/types, @/utils
- 1 command(s): missing dependencies: @/components, @/hooks, @/utils
- 1 command(s): No default application for https://www.feishu.cn/drive/create/?type=base
- 1 command(s): No default application for https://www.feishu.cn/drive/create/?type=docx
- 1 command(s): No default application for https://www.feishu.cn/drive/create/?type=mindnote
- 1 command(s): No default application for https://www.feishu.cn/drive/create/?type=sheet
- 1 command(s): Preference "defaultStreamingApp" needs a scalar "default"
- 1 command(s): Preference "executablePath" needs a scalar "default"
- 1 command(s): presets2 is not iterable
- 1 command(s): request to https://api.buddy.works/workspaces failed, reason: getaddrinfo ENOTFOUND api.buddy.works
- 1 command(s): request to https://api.urbandictionary.com/v0/random failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com
- 1 command(s): request to https://api.xqc.wtf/vods?$limit=#&$sort[createdAt]=-# failed, reason: getaddrinfo ENOTFOUND api.xqc.wtf
- 1 command(s): request to https://azuresearch-usnc.nuget.org/query?&prerelease=false&semVerLevel=#.# failed, reason: getaddrinfo ENOTFOUND azuresearch-usnc.nuget.org
- 1 command(s): request to https://m.hupu.com/api/v2/bbs/walkingStreet/threads?page=# failed, reason: getaddrinfo ENOTFOUND m.hupu.com
- 1 command(s): request to https://tarot-api-mu.vercel.app/api/cards/random?n=# failed, reason: getaddrinfo ENOTFOUND tarot-api-mu.vercel.app
- 1 command(s): request to https://zipper.dev/api/bootInfo/blast failed, reason: getaddrinfo ENOTFOUND zipper.dev
- 1 command(s): sandbox child exited with SIGINT: # | const handshake = new Promise<void>((done) => { # | resolveReady = done; # | }); # | function fail(error: Error) …
- 1 command(s): spawn powershell.exe ENOENT
- 1 command(s): spawnSync bash EPERM
- 1 command(s): The GeForce NOW extension is only supported on Windows.
- 1 command(s): Unsupported API in Blast: Form.DatePicker.Date
- 1 command(s): Unsupported API in Blast: Icon.Lightbulb

## Unsupported and denied capabilities

- 266 command(s): storage.get
- 117 command(s): open.url
- 15 command(s): oauth.tokens.get
- 14 command(s): clipboard.copy
- 13 command(s): storage.all
- 8 command(s): storage.set
- 6 command(s): open.path
- 4 command(s): clipboard.paste
- 4 command(s): storage.remove
- 2 command(s): command.launch
- 1 command(s): browser.tabs
- 1 command(s): clipboard.clear
- 1 command(s): Form.DatePicker.Date
- 1 command(s): Icon.Lightbulb

## Primary action probe

4867 rendered command(s) were probed through client-core; a denied capability counts as working as far as a headless run can show.
Render-only crash rate 157/5759 (2.7%); after the primary action 3/1358 dispatched (0.2%); probe time 170.6 ms/dispatched command.

- navigated: 132 command(s)
- scene-changed: 718 command(s)
- capability-requested: 282 command(s)
- no-items-or-content: 3292 command(s)
- items-but-no-primary-action: 167 command(s)
- still-loading: 52 command(s)
- no-op: 1 command(s)
- crashed: 3 command(s)
- timeout: 220 command(s)

### Primary action crash causes

- 1 command(s): request to https://scrapbox.io/api/pages/blast-smoke?sort=accessed&limit=# failed, reason: getaddrinfo ENOTFOUND scrapbox.io
- 1 command(s): spawn delphitools ENOENT
- 1 command(s): spawn EPERM

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
