# Capabilities

The machine-readable source of truth is `CAPABILITIES` in
`packages/protocol/src/capabilities.ts`; this page is its human view.

Privileged `@raycast/api` calls become `capability.request { name, params }`
messages (decision 0001). The host broker denies by default; a missing handler
answers `denied`, a throwing one `failed`. This file lists what each family
does; `docs/cli.md` lists the headless answers and flags.

## Session-scoped (no grant)

The engine supplies these defaults for the session's own extension: `storage.*` (LocalStorage, see `docs/architecture.md`), internal
`blast:internal` storage (dropdown/field `storeValue`, form drafts),
`oauth.tokens.*`, and the extension's own AI model provider (`ai.ask` with a
`{ id }` model, `ai.models.refresh`; decision 0006).

Headless answers belong to `@blastlauncher/cli`, not the engine. The CLI and TUI
register `createHeadlessHandlers` explicitly for neutral applications, selection,
window and clipboard reads, metadata and preference requests. Without registered
handlers these client capabilities are denied. Engine → extension → launch
registrations override in that order; session-scoped handlers apply last.

## Requests a client must answer or grant

`ai.ask` returns a supplied full-text answer as one runtime `data` chunk; abort
stops waiting and suppresses late data. `browser.tabs` / `browser.content` use
supplied tabs and content. These capabilities are denied by default. The CLI
opts in with `--ai-answer` / `--browser-tabs`. AI.experimental_decide requests
`ai.decide` (denied by default); `--ai-decide <file.json>` supplies typed answers
validated by the runtime. Its AbortSignal stops waiting. Supplied browser content is returned as is,
without format conversion, and CSS selectors are unsupported in the headless host.
Embedders answering `browser.content` must select `tabId` (the active tab when
omitted), apply `cssSelector` for HTML/text, and convert to the requested
`format` (default markdown). The runtime forwards those options and returns the
handler's string unchanged; markdown with a selector is rejected before dispatch.
BrowserExtension.getContent remains partial until an embedder supplies this.

`OAuth.PKCEClient` generates S256 PKCE requests and delegates authorization to
`oauth.authorize` (denied unless a client answers it; CLI: `--oauth-code <code>`).
`oauth.tokens.get|set|remove` need no grant within the session extension. Provider
IDs (default: provider name) key token sets in `<dataDir>/oauth/storage/<extension>.json`;
writes are atomic, serialized within the host, and mode 0600. CLI capability output
redacts token payloads. No browser or redirect server runs in the headless host.

`WindowManagement` brokers `window.desktops|list|active|setBounds`. The broker
requires grants; the headless client installs read handlers returning one empty
desktop, no windows, and a rejection for no active window. `window.setBounds`
and `Action.InstallMCPServer` (`mcp.install`) require explicit grants.
`getDefaultApplication(path)` requests `applications.default`; headless rejects
because it has no application association database. `captureException` and
`captureMemorySnapshot` emit runtime error/debug logs without network reporting.
Manifest preference defaults reach `getPreferenceValues()`, with command defaults
and then caller-supplied preferences taking precedence. The TUI loads saved
extension and command values from `<dataDir>/preferences/<encoded-name>.json`
(plaintext, mode 0600). Required values without defaults prompt before launch;
Ctrl-E edits the selected command's preferences. `preferences.open` returns to
the picker form (extension scope edits extension fields only). The picker
installs dependencies under `<dataDir>/deps/`, showing npm progress and failures;
a failed install still permits a shared-dependency fallback launch.

`open(target, application?)` requests `open.url` for URLs (a `file:` URL counts
as a file) and `open.path` for files, so a client can grant opening links
without granting file opens.

The terminal client registers the same headless handlers as `blast run`, with
client handlers for `clipboard.copy|paste|read|clear` and `open.url`. Clipboard
content (text, HTML, file path) stays in memory for one session; paste records
content there, and nonzero history offsets return empty text. Nothing reaches
the system clipboard or another application. URL opens append to the session's
`effects.urls` record without launching a browser. Other effects remain denied.

## Optional native desktop handlers

`createNativeHandlers()` from `@blastlauncher/native` supplies application,
selection and window handlers when the embedder registers them. It runs fixed
scripts through `execFile` with argument arrays; it installs no tools or daemons.
Missing executables fail with the required tool and capability name.

- macOS: AppKit/JXA discovers applications, associations and the frontmost app;
  Finder/JXA reads selected files. Window operations require an installed, running
  [`yabai`](https://github.com/asmvik/yabai/blob/master/doc/yabai.asciidoc), including
  its required accessibility permissions. Space IDs are Mission Control indices
  (refresh after rearranging Spaces); screen IDs are display UUIDs. Numeric moves
  and resizes require windows that yabai can move/resize (normally floating).
  Exit native fullscreen before requesting numeric bounds.
- Windows: PowerShell `Get-StartApps` supplies launch identities as
  `shell:AppsFolder\<AppID>`; `AssocQueryString` resolves default executables.
  `SHAssocEnumHandlers` lists handlers for a file extension. Explorer selection
  comes from the frontmost Explorer window. Window reads and bounds use
  user32 and `IVirtualDesktopManager`; desktop enumeration and generic fullscreen
  are unsupported. Windows can restrict moving another process's window between
  virtual desktops; these failures propagate.
- Linux: application discovery reads XDG `.desktop` entries in precedence order,
  honoring hidden overrides and MIME associations. Application paths are desktop
  files (opening with one uses `gio launch`); gio handles `Exec` templates.
  `xdg-mime` resolves MIME types/default handlers. X11 frontmost lookup uses
  `xdotool` and `/proc`; windows use `wmctrl`, `xdotool`, and `xprop` with an EWMH
  window manager. Desktops span the X screen, identified by `DISPLAY`. Text reads
  use the primary selection (`xclip`, or `wl-paste --primary` on Wayland).
  File-manager selection is unsupported. Wayland window/frontmost operations
  reject explicitly, even when an XWayland `DISPLAY` is present.

On macOS and Windows, selected text requires temporarily clearing the clipboard,
sending Copy to the focused app, waiting up to one second, reading text and
restoring the captured formats in a `finally` block. This needs automation /
accessibility permission and an app that handles Copy. It can briefly expose
selected text on the clipboard; clipboard managers, delayed providers, concurrent
clipboard writes and focus changes can interfere. Selection reads are serialized
within one handler registry. An empty selection returns an empty string.

Alerts with `rememberUserChoice` expose a `rememberChoice` checkbox value and
`onRememberUserChoiceChange(boolean)` handler. Clients draw the checkbox and
dispatch its changes before the Alert.Action event. Checked answers persist in
`blast:internal` under `blast:alert:` keys scoped to command and alert text/actions;
subsequent calls return the saved answer and run its callback without a scene.
LocalStorage cannot read or clear these choices. Embedders can reset them by
removing the command's `blast:alert:` keys from internal storage.

Action.SubmitForm exposes `submissionFailureCount`, incremented on each sync or
async `false` result. Embedders observe changes to show failure feedback and
honor their user's Reduce Motion setting. Drafts remain intact on failure.
