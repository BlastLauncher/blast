---
id: "0114"
title: In-process web launcher example (engine + client-core, no dependencies)
status: todo
milestone: M7
depends: []
---

## Goal

`examples/web-launcher/` shows the in-process API in its most common shape: a
local Node 24 server built on `createEngine` and `createController`, and a
plain browser page that draws the controller's view and sends input back. It
runs with `bun run example:web <extensionDir> [command]`, prints a local URL,
and is covered by automated tests that need no browser.

## Context

- **APIs:**
  - In process: `docs/embedding.md` ("In-process").
  - The controller: `packages/client-core/src/controller.ts`. Its
    `ControllerView` is what the Go and AppKit examples draw over
    `blast serve`, so the page draws the same model.
- **Server:**
  - **Modules:** `node:http` only; no new dependencies, and no build step,
    because Node 24 strips types.
  - **Binding:** 127.0.0.1 only, port 0 by default, with a `--port` flag.
  - **Endpoints:** `GET /` (the page and its module), `GET /events` (an SSE
    stream of view models, replaying the latest one), `POST /input` (the
    controller input JSON) and `POST /launch` (switch command).
  - **Token:**
    - Each run creates a random token, carried in the printed URL as `?t=`.
    - Every endpoint rejects requests with a missing or wrong token.
    - `POST`s also need `Content-Type: application/json`, so another local
      website cannot drive the extension.
- **Capabilities:**
  - The server never touches the OS. `clipboard.copy` and `open.url` are sent
    to the page as effects over SSE, and the page performs them with
    `navigator.clipboard` and `window.open`.
  - Everything else is left ungranted, so the engine denies it.
  - Document this trust model in the README.
- **Page:**
  - Vanilla ES modules.
  - A pure `render(view) → HTML string` covers search, list rows with the
    selection, detail markdown as escaped text, the action panel, toasts and
    the form fields the controller exposes. It escapes every string.
  - A thin DOM layer handles keys: arrows, Enter, ⌘K, Esc.
- **Wiring:**
  - `tsconfig.json` `include` must cover `examples/web-launcher` so verify
    typechecks it.
  - verify already picks up `*.test.ts` files that git tracks.
- **README:** run steps, trust model, and what is out of scope.

## Safety (hard rules)

- Never open a browser, run `open`, or start the server outside tests.
- Tests start the server in-process on 127.0.0.1 port 0 and always close it.
- Tests use fixture extensions under `fixtures/extensions/`, so no network or
  installs are needed.
- Never `rm -rf` a path held in a shell variable.

## Acceptance

- [ ] Server tests, using a fixture such as `fixtures/extensions/hello-list`:
  - [ ] SSE delivers an initial list view;
  - [ ] `POST /input` with search or selection produces an updated view;
  - [ ] a primary action that copies emits a `clipboard.copy` effect event;
  - [ ] a wrong or missing token gets 403 on all four endpoints;
  - [ ] a non-JSON POST gets 415;
  - [ ] after close, no session or process is left behind.
- [ ] `render()` unit tests:
  - [ ] list, detail, form, action panel and toast;
  - [ ] an HTML-injection string is escaped.
- [ ] `bun run example:web --help` prints usage and exits 0.
- [ ] `bun run verify` passes, including typecheck of the example.

## Out of scope

- Any UI framework or bundler.
- Electron.
- Real OS handlers (`@blastlauncher/native`).
- Grid and menu bar beyond a plain fallback message.
- Publishing.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
