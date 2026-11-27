# Capabilities

The machine-readable source of truth is `CAPABILITIES` in
`packages/protocol/src/capabilities.ts`; this page is its human view.

Privileged `@raycast/api` calls become `capability.request { name, params }`
messages (decision 0001). The host broker denies by default: a missing handler
returns `denied`, a throwing one returns `failed`. Engine → extension → launch
registrations override in that order; session-scoped handlers win last.

## Session-scoped (no grant)

The engine answers these for the session's own extension: `storage.*`
(LocalStorage, see [architecture.md](architecture.md)), internal
`blast:internal` storage (dropdowns, `storeValue`, drafts, remembered alerts),
`oauth.tokens.*`, and the extension's own AI model provider (`ai.ask` with a
`{ id }` model, `ai.models.refresh`; decision 0006).

Headless defaults (`createHeadlessHandlers`) belong to `@blastlauncher/cli`, not
the engine. The CLI and TUI register them explicitly for neutral applications,
selection, window/clipboard reads, metadata, and preference requests. See
[cli.md](cli.md) for CLI flags.

## Requests a client must answer or grant

`ai.ask` returns a supplied answer (or streams from the extension's own
provider); abort stops waiting and suppresses late chunks. `ai.decide` answers
`AI.experimental_decide` (denied unless supplied). `browser.tabs` and
`browser.content` are denied by default. Embedders answering `browser.content`
must select `tabId` (active tab when omitted), apply `cssSelector` for HTML or
text, and convert to `format` (default markdown; runtime rejects markdown with a
selector). `startBrowserBridge` in `@blastlauncher/native` serves real browsers
over a loopback WebSocket (decision 0018).

`OAuth.PKCEClient` generates S256 PKCE requests and delegates authorization to
`oauth.authorize` (denied unless handled). `oauth.tokens.get|set|remove` need no
grant within the session extension and persist in
`<dataDir>/oauth/storage/<extension>.json` (atomic, serialized, mode 0600).

`WindowManagement` requests `window.desktops|list|active|setBounds`;
`Action.InstallMCPServer` requests `mcp.install`; `getDefaultApplication`
requests `applications.default`. `captureException` and `captureMemorySnapshot`
emit runtime logs without network reporting.

Manifest preference defaults reach `getPreferenceValues()`, overridden by
command defaults and caller-supplied values. The engine's launch prompt and TUI
save preferences in `<dataDir>/preferences/<encoded-name>.json` (plaintext, mode
0600); `preferences.open` opens the Configure form.

`open(target, application?)` requests `open.url` for URLs (`file:` URLs count as
files) and `open.path` for files, so clients can grant URLs without file opens.

`clipboard.paste` handlers receive `closeMainWindow` (default `true`). When
true, the embedder hides its launcher before posting ⌘V; when false, it stays
visible. Native embedders can pass `createNativeHandlers({ beforePaste })` to
run an awaited hook between writing the clipboard and posting the keystroke.

## Optional native desktop handlers

`createNativeHandlers()` from `@blastlauncher/native` supplies application,
selection, clipboard, open, finder, trash, and window handlers. It runs fixed
executables via `execFile` with argument arrays and installs no daemons; missing
tools fail naming the required executable and capability.

- **macOS:** AppKit/JXA discovers apps, associations, and the frontmost app;
  Finder/JXA reads selected files. Window ops prefer running
  [`yabai`](https://github.com/asmvik/yabai/blob/master/doc/yabai.asciidoc),
  falling back to Core Graphics reads (`screen:<display UUID>` desktops) and
  System Events moves/resizes (requires Accessibility permission; cross-display
  moves and Mission Control Spaces are unsupported in fallback; exit native
  fullscreen before numeric bounds).
- **Windows:** PowerShell `Get-StartApps` lists `shell:AppsFolder\<AppID>` apps;
  `AssocQueryString` and `SHAssocEnumHandlers` resolve file associations;
  Explorer gives selection; user32 and `IVirtualDesktopManager` drive windows
  (desktop enumeration and generic fullscreen are unsupported).
- **Linux:** XDG `.desktop` entries, `gio launch`, and `xdg-mime` handle apps.
  X11 uses `xdotool`, `wmctrl`, `xprop`, and `/proc` with an EWMH window
  manager; text selection uses primary selection (`xclip`, or
  `wl-paste --primary` on Wayland). File-manager selection is unsupported, and
  Wayland window/frontmost ops reject even under XWayland.

On macOS and Windows, `selection.text` temporarily clears the clipboard, sends
Copy to the focused app, waits up to 1 s, reads text, and restores captured
formats in `finally`. This needs Accessibility permission and an app that
handles Copy; clipboard managers or focus changes can interfere. Selection reads
are serialized per registry, and empty selections return `""`.

## Alerts and form feedback

Alerts with `rememberUserChoice` expose `rememberChoice` and
`onRememberUserChoiceChange(boolean)`; clients dispatch changes before the
`Alert.Action` event. Checked choices persist in `blast:internal` under
`blast:alert:` keys and auto-invoke on later calls without showing a scene.
Embedders can reset choices by deleting those keys from internal storage.

`Action.SubmitForm` exposes `submissionFailureCount`, incremented on sync or
async `false` results so embedders can show failure feedback while honoring
Reduce Motion. Drafts remain intact on failure.
