# Capabilities

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
