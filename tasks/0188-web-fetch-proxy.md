---
id: "0188"
title: "`fetchProxy` in `@blastlauncher/web`: sandbox fetch and XHR through the proxy"
status: doing
milestone: M15
depends: ["0187"]
---

## Goal

An embedder passes `fetchProxy: "https://proxy.example/v1"` to `mount()` (or
`fetch-proxy` on `<blast-extension>`), and every cross-origin network request
made by extension code in the sandbox goes through that proxy, so APIs without
CORS headers work. Without the option nothing changes.

## Context

- Proxy and wire format: `packages/cors-proxy` (task 0187, read its README and
  `docs/decisions/0017-sandbox-network-proxy.md`). A request to target `T`
  becomes `<fetchProxy>?url=<encodeURIComponent(T)>` with the same method,
  headers and body. `fetchProxy` is the full `/v1` endpoint URL.
- Production proxy is live at `https://blast-proxy.yukai.dev/v1` and accepts
  only `Origin: https://blastlauncher.github.io`. Tests must not use it: no
  network in `bun test`.
- Sandbox side: `packages/web/sandbox/runtime-entry.ts` already patches XHR
  (`request-headers.ts`) before command code runs. Add the rewrite next to it
  (e.g. `sandbox/fetch-proxy.ts`): wrap `globalThis.fetch` (string, `URL` and
  `Request` inputs) and `XMLHttpRequest.prototype.open`. Find out what
  almostnode's `http`/`https`/`undici`-style modules use underneath
  (`.cache/browser-demo/deps/node_modules/almostnode/src`) and make sure Node-
  style clients (`node-fetch`, `axios`, `got`/`https.request`) end up on a
  rewritten path too; cover the ones that do with tests, and list in Handoff
  any that cannot be covered.
- Rewrite only absolute `http:`/`https:` URLs whose origin differs from the
  sandbox page's own origin and is not the proxy's origin. Leave relative,
  `data:`, `blob:` and same-origin URLs alone. `http:` targets are rewritten
  too (the proxy refuses them with a readable 403, which beats a mixed-content
  failure). Force `credentials: "omit"` on rewritten requests. Response `url`
  stays whatever the browser reports; do not fake it.
- Host side: `WebMountOptions.fetchProxy` (`packages/web/src/session.ts`),
  `fetch-proxy` attribute (`custom-element.ts`). The value must reach the
  sandbox before any command code runs, including a prewarmed sandbox, so it
  is part of the sandbox key (`keyOf` in `sandbox.ts`). Validate it as an
  absolute https URL (allow `http://127.0.0.1`/`localhost` for tests).
- e2e: extend an existing browser e2e (`examples/web-embed/e2e.ts` or
  `examples/browser-runtime/e2e.ts`, whichever is cheaper) with a local
  `Bun.serve` running `handleRequest` from `@blastlauncher/cors-proxy` (fake
  rate limiter, `ALLOWED_ORIGINS` = the local sandbox origin) and a local
  upstream that sends **no** CORS headers. A fixture command fetches it: with
  `fetchProxy` it renders the data, without it fails as today. Pin
  `CF-Connecting-IP` in the local server since Bun.serve has none.
- Docs: `packages/web/README.md` options list and the "In a web page" section
  of `docs/embedding.md`: what the option does, that the proxy operator sees
  request contents, and that embedders deploy their own proxy from
  `packages/cors-proxy`.

## Acceptance

- [ ] Unit tests for the URL rewrite rules (each kept/rewritten case above) and
      for fetch `Request` inputs with bodies and headers.
- [ ] The browser e2e proves a no-CORS upstream renders with `fetchProxy` and
      fails without it; command and output in Handoff.
- [ ] `<blast-extension fetch-proxy>` is passed through (unit test).
- [ ] Docs updated as above.
- [ ] `bun run verify` passes.

## Out of scope

- Site/demo wiring, the policy notice, sweep reruns (0189).
- Any change to `packages/cors-proxy` behaviour; if the proxy needs a change,
  stop and say why in Handoff.
- Requests made by the host page (GitHub sources, npm registry).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
