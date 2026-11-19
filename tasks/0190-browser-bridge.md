---
id: "0190"
title: Browser bridge for real BrowserExtension tabs and content
status: doing
milestone: M16
depends: []
---

## Goal

`BrowserExtension.getTabs()` and `getContent({ tabId, format, cssSelector })`
answer from a real browser through the Raycast companion-extension protocol,
so `BrowserExtension.getContent` is no longer `partial` in `compat/`.

## Context

- Read `docs/decisions/0018-browser-bridge.md` first: protocol, package,
  trust boundary. Follow it exactly.
- Protocol reference (read-only, do not copy code; its license is unclear):
  `https://github.com/Yukaii/raycast-context-bridge` — `src/lib/raycast.ts`
  (JSON-RPC framing, error codes, `whoami`/`ping`), `src/background/index.ts`,
  `src/background/methods/getTabs.ts`, `getTab.ts`, `src/content/index.ts`
  (`handleGetTab`). Fetch with `gh api` if needed; nothing goes into the repo.
- Today: `packages/cli/src/browser.ts` builds `browser.tabs`/`browser.content`
  handlers from `--browser-tabs <file.json>`; `packages/cli/src/cli.ts` wires
  them and adds `"BrowserExtension"` to `availableAPIs` (search
  `browserTabs`). Runtime side: `packages/runtime/src/api/ai-browser.ts`
  (already forwards `tabId`, `format`, `cssSelector`; keep its validation).
  Capability shapes: `packages/protocol/src/capabilities.ts`.
- New module `packages/native/src/browser-bridge.ts`, exported from the
  package (add an `exports` entry or re-export from `index.ts`), e.g.
  `startBrowserBridge({ port, allowedOrigins?, timeoutMs? }) →
  Promise<{ port, handlers, close() }>`. `port: 0` must work for tests.
- Mapping: `browser.tabs` → `getTabs` → `{ id: tabId, url, title, favicon,
  active }` (drop other fields, drop tabs without id/url). `browser.content`
  → `getTab { field: "content", tabId?, format?, selector: cssSelector? }` →
  `value` as string. Reject a JSON-RPC error result with its message. Time
  out a request after 10 s with a clear error. Answer the extension's `ping`
  requests; ignore notifications.
- Dependency: `ws` (`npm view ws version` → pin exact) in
  `packages/native/package.json`; `@types/ws` as dev dependency if needed.
- CLI: `--browser-bridge [port]` (default 7265) starts the bridge for the run,
  registers its handlers, enables `BrowserExtension`, and closes it on exit.
  It conflicts with `--browser-tabs` (usage error, exit 2). Address in use →
  clear error naming the port and suggesting another.

## Acceptance

- [ ] `packages/native/src/browser-bridge.test.ts` uses a fake client (`ws`
      `WebSocket` to `127.0.0.1`, port 0, extension Origin) that speaks the
      protocol, and tests: tab mapping; content with `tabId`, `format` and
      `selector` forwarded; JSON-RPC error propagated; no client → rejection
      mentioning the companion extension; `ping` answered; latest client wins
      after the first disconnects; request timeout (inject a short timeout).
- [ ] Origin tests: `https://evil.example`, `null` and missing Origin are
      refused; `chrome-extension://abc` and `moz-extension://abc` accepted;
      an allowlisted custom origin accepted. Server binds 127.0.0.1 only.
- [ ] A test in `packages/cli` runs a fixture command with `--browser-bridge 0`
      or an injectable equivalent and a fake client, and sees real content
      reach the scene; `--browser-bridge` with `--browser-tabs` exits 2.
- [ ] `// @covers BrowserExtension.getContent` (no `partial`) on the bridge
      test; `bun run compat:report` regenerated; `compat/COVERAGE.md` shows
      1540/1540 non-deprecated covered.
- [ ] `docs/cli.md` documents `--browser-bridge`, the companion-extension
      setup in two sentences, and the origin rule; `docs/architecture.md`
      mentions the bridge in one line.
- [ ] No sockets left open after tests; tests pass under randomized order.
- [ ] `bun run verify` passes.

## Out of scope

- Wiring the bridge into `blast serve`, the TUI or `@blastlauncher/web`.
- Other companion methods (bookmarks, history, element click/fill, executeJS).
- Bundling, vendoring or modifying the browser extension.
- Manual testing against a real browser (the orchestrator does it).

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
