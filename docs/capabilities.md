# Capabilities

Privileged `@raycast/api` calls become `capability.request { name, params }`
messages (decision 0001). The host broker denies by default; a missing handler
answers `denied`, a throwing one `failed`. This file lists what each family
does; `docs/cli.md` lists the headless answers and flags.

## Session-scoped (no grant)

These act only on the session's own extension, so `blast run` installs them by
default: `storage.*` (LocalStorage, see `docs/architecture.md`), internal
`blast:internal` storage (dropdown/field `storeValue`, form drafts),
`oauth.tokens.*`, and the extension's own AI model provider (`ai.ask` with a
`{ id }` model, `ai.models.refresh`; decision 0006).

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
and then caller-supplied preferences taking precedence.

`open(target, application?)` requests `open.url` for URLs (a `file:` URL counts
as a file) and `open.path` for files, so a client can grant opening links
without granting file opens.
