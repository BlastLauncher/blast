# Corpus sweep report

Corpus commit `bad7de0172ce6ea5e721ed919f4e1d7186f74192`; seed `0091`; 1939 selected extensions and 5759 commands (5759 command records).
4806 resumed command(s).
This is a resumed run: wall time, throughput, peak and projected-full-population values are partial-run artifacts; use a clean run (or per-batch timing) for those metrics.
Rendered means a first scene was published; it does not assert that the command works with live data or actions.


## Outcomes

- rendered: 5266 command(s)
- completed: 35 command(s)
- capability-denied: 158 command(s)
- sandbox-denied: 60 command(s)
- bundle-failed: 34 command(s)
- native-module: 117 command(s)
- bundle-timeout: 0 command(s)
- crashed: 70 command(s)
- network: 17 command(s)
- timeout: 0 command(s)
- unsupported-mode: 0 command(s)
- unsupported-api: 2 command(s)
- missing-arguments: 0 command(s)

## Failure causes

- 117 command(s): Capability denied: open.url
- 49 command(s): spawn EPERM
- 23 command(s): Invalid URL
- 22 command(s): native modules: swift:../swift
- 20 command(s): native modules: rust:../rust
- 16 command(s): Capability denied: clipboard.copy
- 14 command(s): native modules: swift:../../swift
- 13 command(s): Preference "terminalApp" needs a scalar "default"
- 10 command(s): spawnSync /bin/sh EPERM
- 9 command(s): Capability denied: oauth.authorize
- 9 command(s): missing dependencies: ws
- 8 command(s): native modules: rust:../../rust
- 7 command(s): Cannot convert undefined or null to object
- 6 command(s): Cannot read properties of undefined (reading 'length')
- 6 command(s): Capability denied: open.path
- 6 command(s): native modules: swift:../swift/dimmer-helper
- 5 command(s): missing dependencies: undici
- 5 command(s): native modules: swift:../swift/locatecursor
- 4 command(s): Capability denied: clipboard.paste
- 4 command(s): Capability denied: command.launch
- 4 command(s): ENOENT: no such file or directory, scandir '<scratch>/Library/Application Support/zen/Profiles'
- 4 command(s): fetch failed
- 4 command(s): native modules: swift:../../swift/contacts
- 4 command(s): native modules: swift:../swift/movecursor
- 3 command(s): Build failed with # error: src/hooks/useHistorySearch.tsx:#:#: ERROR: [plugin: blast-dependencies] Cannot find package '@raycast/utils' imported from <repo>/p…
- 3 command(s): Cannot read properties of undefined (reading 'trim')
- 3 command(s): ENOENT: no such file or directory, open '<scratch>/bundle/package.json'
- 3 command(s): native modules: rust:../../rust/winget-com
- 3 command(s): native modules: swift:../../swift, swift:../swift
- 3 command(s): native modules: swift:../swift/fullscreen
- 3 command(s): native modules: swift:../swift/hide-details
- 2 command(s): native modules: swift:../../swift/window-kickflip
- 2 command(s): native modules: swift:../swift/display-helper
- 2 command(s): native modules: swift:../swift/keyprobe-helper
- 2 command(s): Preference "menu_bar_icon_only" needs a scalar "default"
- 2 command(s): Rendered fewer hooks than expected. This may be caused by an accidental early return statement.
- 2 command(s): request to https://api.urbandictionary.com/v0/words_of_the_day failed, reason: getaddrinfo ENOTFOUND api.urbandictionary.com
- 2 command(s): request to https://www.gov.uk/bank-holidays.json failed, reason: getaddrinfo ENOTFOUND www.gov.uk
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
- 1 command(s): Controller URL must be a valid HTTPS URL.
- 1 command(s): Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: object.
- 1 command(s): ENOENT: no such file or directory, lstat '<scratch>/.config/valet/valet.sock'
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/AppData/Local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'
- 1 command(s): ENOENT: no such file or directory, open '<scratch>/Library/Application Support/obsidian/obsidian.json'
- 1 command(s): ENOENT: no such file or directory, open '~/Documents/#-#-#.md'
- 1 command(s): ENOENT: no such file or directory, scandir '<scratch>/Desktop'
- 1 command(s): native modules: rust:../../../rust
- 1 command(s): native modules: rust:../../rust, rust:../rust
- 1 command(s): native modules: rust:../rust/clean-keyboard, swift:../swift/MyExecutable
- 1 command(s): native modules: rust:../rust/ruler, swift:../swift/Ruler
- 1 command(s): native modules: swift:../../swift/Location
- 1 command(s): native modules: swift:../QuitAllButFocused
- 1 command(s): native modules: swift:../swift/blackr-overlay
- 1 command(s): native modules: swift:../swift/caps-lock
- 1 command(s): native modules: swift:../swift/cursor-helper
- 1 command(s): native modules: swift:../swift/menu-bar-icon-search
- 1 command(s): native modules: swift:../swift/motion-preview
- 1 command(s): native modules: swift:../swift/privmask-bridge
- 1 command(s): native modules: swift:../swift/Punto
- 1 command(s): native modules: swift:../swift/screen-draw
- 1 command(s): native modules: swift:../swift/simple-draw
- 1 command(s): native modules: swift:../swift/svga-player
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
- 1 command(s): request to https://blast-smoke/api/v1/apps failed, reason: getaddrinfo ENOTFOUND blast-smoke
- 1 command(s): request to https://envoyer.io/api/projects failed, reason: getaddrinfo ENOTFOUND envoyer.io
- 1 command(s): request to https://m.hupu.com/api/v2/bbs/walkingStreet/threads?page=# failed, reason: getaddrinfo ENOTFOUND m.hupu.com
- 1 command(s): request to https://tarot-api-mu.vercel.app/api/cards/random?n=# failed, reason: getaddrinfo ENOTFOUND tarot-api-mu.vercel.app
- 1 command(s): request to https://zipper.dev/api/bootInfo/blast failed, reason: getaddrinfo ENOTFOUND zipper.dev
- 1 command(s): spawn powershell.exe ENOENT
- 1 command(s): spawnSync bash EPERM
- 1 command(s): The GeForce NOW extension is only supported on Windows.
- 1 command(s): Unsupported API in Blast: Form.DatePicker.Date
- 1 command(s): Unsupported API in Blast: Icon.Lightbulb

## Unsupported and denied capabilities

- 117 command(s): open.url
- 16 command(s): clipboard.copy
- 9 command(s): oauth.authorize
- 6 command(s): open.path
- 4 command(s): clipboard.paste
- 4 command(s): command.launch
- 1 command(s): browser.tabs
- 1 command(s): clipboard.clear
- 1 command(s): Form.DatePicker.Date
- 1 command(s): Icon.Lightbulb

## Primary action probe

5256 rendered command(s) were probed through client-core; a denied capability counts as working as far as a headless run can show.
Render-only crash rate 70/5759 (1.2%); after the primary action 5/1441 dispatched (0.3%); probe time 178.2 ms/dispatched command.

- navigated: 156 command(s)
- scene-changed: 773 command(s)
- capability-requested: 259 command(s)
- sandbox-denied: 1 command(s)
- no-items-or-content: 3486 command(s)
- items-but-no-primary-action: 183 command(s)
- still-loading: 148 command(s)
- no-op: 2 command(s)
- crashed: 5 command(s)
- timeout: 243 command(s)

### Primary action crash causes

- 1 command(s): EISDIR: illegal operation on a directory, read
- 1 command(s): No default application for https://github.com/search?q=&type=code
- 1 command(s): request to https://scrapbox.io/api/pages/blast-smoke?sort=accessed&limit=# failed, reason: getaddrinfo ENOTFOUND scrapbox.io
- 1 command(s): spawn delphitools ENOENT
- 1 command(s): Unexpected end of JSON input

The per-command log remains in `.cache/sweep/results.jsonl` and is intentionally not committed.
