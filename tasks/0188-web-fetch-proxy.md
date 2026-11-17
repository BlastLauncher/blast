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

- [x] Unit tests for the URL rewrite rules (each kept/rewritten case above) and
      for fetch `Request` inputs with bodies and headers.
- [x] The browser e2e proves a no-CORS upstream renders with `fetchProxy` and
      fails without it; command and output in Handoff.
- [x] `<blast-extension fetch-proxy>` is passed through (unit test).
- [x] Docs updated as above.
- [x] `bun run verify` passes.

## Out of scope

- Site/demo wiring, the policy notice, sweep reruns (0189).
- Any change to `packages/cors-proxy` behaviour; if the proxy needs a change,
  stop and say why in Handoff.
- Requests made by the host page (GitHub sources, npm registry).

## Handoff

```
Branch/commit: t3/web-fetch-proxy-1 @ 9652a1889221815e0535251d5fc923f1026ead63 (implementation; handoff follows)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)
Done:
- Validated fetchProxy and fetch-proxy plumbing; proxy identity participates in prewarm reuse and wrappers install before any runtime/command bundle.
- Wrapped fetch (string/URL/Request) and XHR, retaining method, headers, body and signal while omitting credentials; relative, non-HTTP, same-origin and proxy-origin URLs stay direct.
- Added URL/Request, custom-element and prewarm tests; no dependencies added and no cors-proxy changes.
- Updated embedding/package docs with deployment and operator visibility guidance.
- Local browser e2e passes for fetch, XHR, http/https.request, axios XHR/fetch adapters and node-fetch GET status, including upstream method/header/body assertions.
Not done / risks: Request bodies are buffered to avoid Chromium's HTTP/2 requirement for streaming uploads. node-fetch response JSON consumption and POST upload hang in almostnode's existing stream shims; GET forwarding and status are covered. got is not installed in the shared cache, and almostnode has no undici built-in, so neither was exercised. No external APIs or production proxy were contacted.
```

Browser command: `bun run example:web-embed:e2e`, with
`PLAYWRIGHT_BROWSERS_PATH` set on the command line to the existing shared browser
cache and the worktree's ignored browser-demo cache symlinked as instructed.
Output (exit 0):

```json
{"network":"fetch/xhr/https/axios: local data via proxy; node-fetch: status 200; all blocked direct","received":["GET node-fetch-header ","POST axios-xhr-header axios-xhr-body","POST xhr-header xhr-body","POST https-header https-body","POST fetch-header fetch-body","POST axios-fetch-header axios-fetch-body"]}
{"pass":true,"rows":3,"copied":"banana","root":true,"assets":true}
```
