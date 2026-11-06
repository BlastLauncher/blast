---
id: "0128"
title: Back common capabilities in the browser demo (storage, clipboard, command, oauth tokens)
status: doing
milestone: M8
depends: []
---

## Goal

Extensions in the browser demo stop failing on capabilities a browser can
honestly provide. The first report from the live site was:

> `storage.get is unavailable in the browser demo`

## Context

- **Today:** `examples/browser-demo/client.ts` (`handleRuntime`) answers only
  `clipboard.copy` and `open.url` and denies everything else.
- **Shapes:** the capability catalog and its params and results are in
  `packages/protocol/src/capabilities.ts`. Match them exactly, including
  storage namespaces (LocalStorage versus internal or form-draft keys).
- **Implement** in a new pure module, e.g. `examples/browser-demo/capabilities.ts`,
  with an injected store, so it can be unit-tested without a browser:
  - **`storage.get|set|remove|all|clear`:** namespaced per extension in
    `localStorage`, e.g. under a key prefix `blast:<extension>:`. Wrap every
    access in try/catch; private mode can throw, and then fall back to
    memory. Values keep their JSON type.
  - **`clipboard.read|clear|paste`:**
    - `read` uses `navigator.clipboard.readText()` when permitted, otherwise
      the last value Blast copied in this session;
    - `clear` empties that session value;
    - `paste` copies and shows "Copied — paste with ⌘V". A page cannot type
      into other apps.
  - **`command.metadata`:** answered from the catalog entry.
  - **`command.launch`:** launches a command of the _same_ extension from the
    catalog, through the normal launch path. Other extensions are denied with
    a clear message.
  - **`oauth.tokens.get|set|remove`:** per-extension storage, as above.
  - **`oauth.authorize`, `preferences.open`:** denied with specific,
    friendly messages.
- **Denials:**
  - `applications.*`, `selection.*`, `window.*` and `ai.*` stay denied, each
    with a reason specific to the browser.
  - The status bar shows a short message, not "X is unavailable in the browser
    demo" for everything.
- **Docs:** a short capability table in `examples/browser-demo/README.md`
  showing what the browser backs and what it denies.

## Acceptance

- [ ] Unit tests for every handler:
  - [ ] storage round trips per namespace, with isolation between extensions;
  - [ ] `all` and `clear`;
  - [ ] the fallback when `localStorage` throws;
  - [ ] clipboard read and paste;
  - [ ] same-extension launch, with cross-extension launches denied;
  - [ ] the oauth token store;
  - [ ] specific denial messages.
- [ ] A fixture command that sets a LocalStorage item, reads it back, and
      renders the value. `site:e2e` shows it, and it persists across
      re-opening the command.
- [ ] `bun run verify` and `bun run site:e2e` pass.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; never write absolute
  personal paths into files; never download Chromium.
- Stub `navigator.clipboard` and `window.open` in tests and sweeps.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build, sweep and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep `.cache` growth under about 150 MB.
- Gate commits on exit codes, not piped output.

## Out of scope

- The browser sweep (0129).
- Ranking (0130).

## Handoff

```
Branch/commit: t3/browser-capabilities-client @ 4cb0e36bdc81a039525687cab91c5dbbd75dde99
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 81.2s
Done:
- Added injected browser capability handlers and unit coverage for storage, clipboard, command, OAuth, and browser-specific denials.
- Wired `client.ts` to the handlers, including catalog-checked same-extension launches and browser status messages.
- Added the `browser-storage` fixture and site e2e persistence check; documented the capability matrix.
Not done / risks: Browser Clipboard API permissions remain browser-controlled; the session copy fallback is used when permission is denied.
```
