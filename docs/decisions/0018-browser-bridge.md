# 0018 — Browser bridge: real tabs through the companion protocol

Status: accepted 2026-11-19; extends 0010 (native capabilities are pluggable)

## Decision

1. **Blast speaks the Raycast companion-extension protocol as the server.**
   The browser extension is the WebSocket client and dials
   `ws://localhost:<port>`; Raycast Release uses 7265. Messages are JSON-RPC
   2.0 in both directions: the extension sends a `whoami` notification and
   `ping` requests; the host calls `getTabs` (result `{ value: Tab[] }`, tab
   fields `tabId`, `url`, `title`, `favicon`, `active`, …) and `getTab` with
   `{ field: "content", format, selector, tabId }` (result `{ value }`).
   The protocol was documented by the reconstruction in
   `Yukaii/raycast-context-bridge`; Blast implements only its own server and
   copies no extension code. Users install that extension (or any compatible
   one) themselves.
2. **It lives in `@blastlauncher/native`** as an optional bridge that returns
   `browser.tabs` and `browser.content` handlers, so the CLI, `blast serve`
   and the TUI can register it like any other native capability (0010).
   The CLI enables it with `--browser-bridge [port]`.
3. **Trust boundary.** The server listens on 127.0.0.1 only. A WebSocket
   upgrade is accepted only when its `Origin` is a browser-extension origin
   (`chrome-extension://`, `moz-extension://`, `safari-web-extension://`) or
   listed in an explicit allowlist; web origins, `null` and a missing Origin
   are rejected, so a web page cannot pose as the browser. Firefox therefore
   needs no origin-rewriting proxy.
4. **One browser at a time.** The most recently connected client answers
   requests; with none connected, the capabilities reject with an error that
   says to install and enable the companion extension.

## Why

`BrowserExtension.getContent` is the last partially covered `@raycast/api`
symbol: headless content is a fixed string per tab with no format or CSS
selector support. A real browser makes `format` and `cssSelector` honest and
works on Linux, where Raycast does not run.

## Consequences

- Port 7265 collides with a running Raycast on macOS; the bridge fails with a
  clear error and accepts another port.
- Any installed browser extension can connect; the allowlist narrows this.
- Adds the `ws` dependency to `@blastlauncher/native` (Node 24 ships a
  WebSocket client but no server).
