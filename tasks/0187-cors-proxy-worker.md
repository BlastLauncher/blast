---
id: "0187"
title: CORS proxy Cloudflare Worker for sandbox network traffic (+ decision)
status: doing
milestone: M15
depends: []
---

## Goal

`packages/cors-proxy` is a Cloudflare Worker that forwards the browser
sandbox's network requests to https APIs and adds CORS headers, accepting only
traffic from our sandbox and storing nothing. A decision record explains the
new trust boundary. Tracked by GitHub issue #102 (read it: `gh issue view 102`).

## Context

- Today extension `fetch`/XHR runs in almostnode's cross-origin sandbox
  (`docs/decisions/0013-browser-runtime.md`, `0015-web-embedding.md`), so APIs
  without CORS headers fail. The demo's sandbox origin is
  `https://blastlauncher.github.io` (`.github/workflows/site.yml`); the runtime
  iframe has no `sandbox` attribute, so requests carry that real `Origin`.
- Task 0188 (next) makes `@blastlauncher/web` send sandbox requests through
  this proxy, and its browser e2e serves this Worker's handler locally with
  `Bun.serve`. Export the handler so that works without Cloudflare tooling.
- **Wire format (0188 depends on it, keep it exact):**
  `<proxy>/v1?url=<encodeURIComponent(absolute target URL)>`, same method,
  headers and body as the original request. `GET /` returns a short plain
  policy page (what is forwarded, nothing logged or stored, do not send
  secrets, link to this package's source on GitHub).
- **Acceptance rules for a request** (otherwise 403/400 with a short text body
  and CORS headers so the sandbox can read the error):
  1. `Origin` is in the `ALLOWED_ORIGINS` var (comma-separated; production
     value `https://blastlauncher.github.io`). `null` and missing are refused.
     Responses echo that origin in `Access-Control-Allow-Origin`, never `*`,
     with `Vary: Origin`.
  2. `Sec-Fetch-Mode: cors` is present (browsers always send it; page scripts
     cannot set it). No custom marker header: it would force a preflight on
     every request.
  3. Target is `https:` on the default port, hostname is not an IP literal in
     private/loopback/link-local/CGNAT/unique-local ranges (v4 and v6), not
     `localhost`, `*.local`, `*.internal`, and not the proxy's own host.
  4. Redirects are followed by the Worker (`redirect: "manual"`, at most 5
     hops), re-validating each `Location` with rule 3.
  5. Rate limit per `CF-Connecting-IP` with the Workers rate-limiting binding
     (look up the current config shape with `cf docs search`; start around
     120 requests / 60 s) → 429.
  6. Request body ≤ 1 MB, response body ≤ 10 MB (Content-Length check plus a
     counting stream when absent) → 413 / 502.
- Forwarded request headers drop `Cookie`, `Origin`, `Referer`, `Host`,
  `CF-*`, `X-Forwarded-*`, `X-Real-IP`; responses drop `Set-Cookie`/`Set-Cookie2`
  and expose the rest (`Access-Control-Expose-Headers: *`). `OPTIONS`
  preflights for allowed origins answer 204 echoing requested method/headers,
  `Access-Control-Max-Age: 600`. No `credentials`.
- **No logging or storage:** no `console.*` in the Worker, Workers
  observability and logpush off in the config, no KV/D1/R2/DO bindings.
- Config: `packages/cors-proxy/wrangler.jsonc`, Worker name `blast-cors-proxy`,
  custom domain `blast-proxy.yukai.dev` (`custom_domain: true`),
  `workers_dev: false`. The `cf` CLI on this machine is logged in; check with
  `cf deploy --help` / `cf docs search` how it reads the config. **Do not
  deploy**; the orchestrator deploys after merge. A `--dry-run` is fine.
- Add `"proxy:deploy"` to root `package.json` running the deploy from that
  package. Typecheck must pass without adding `@cloudflare/workers-types`:
  declare the few Worker types you need locally.
- Decision record `docs/decisions/0017-sandbox-network-proxy.md` (≤ 60 lines):
  sandbox network goes through an embedder-hosted proxy; amends 0013's
  "subject to CORS" consequence and 0015 (opt-in `fetchProxy`, our proxy
  serves the demo only, embedders deploy their own from this source). State
  plainly that Origin/Sec-Fetch checks only stop browsers on other sites, and
  rate limits and size caps are what bound scripted abuse; and that the proxy
  operator can see request contents (API keys) even though it logs nothing.
  Do not edit PLAN.md; the orchestrator adds the decision-log line.

## Acceptance

- [ ] `bun test packages/cors-proxy` covers each rule above with an injected
      upstream fetch (no network): allowed request forwarded with headers
      stripped and CORS added; bad/missing/`null` origin; missing
      `Sec-Fetch-Mode`; http target, non-443 port, private v4/v6 literals,
      localhost; redirect to a private host refused; >5 redirects; rate limit
      429; oversize request and response; preflight; `GET /` policy page.
- [ ] `cf deploy --dry-run` (or the documented equivalent) succeeds from
      `packages/cors-proxy`; paste the command in Handoff.
- [ ] `docs/decisions/0017-sandbox-network-proxy.md` exists and `check:workflow` passes.
- [ ] `packages/cors-proxy/README.md` (short): rules, wire format, how to deploy your own.
- [ ] `bun run verify` passes.

## Out of scope

- `@blastlauncher/web` / sandbox changes (0188), site notice and wiring (0189).
- Deploying, creating DNS records, or any change in the Cloudflare account.
- CI deploy jobs.

## Handoff

```
Branch/commit: t3/cors-proxy-worker @ HEAD (worker commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok)
Done:
- Added the proxy, local injected-fetch tests, deployment config and decision record.
- Dry run: cd packages/cors-proxy && bunx wrangler deploy --dry-run --outdir ../../.cache/cors-proxy-dry-run
- Pinned Wrangler 4.163.0 as a local dev dependency for deployment and dry runs.
Not done / risks: Cloudflare's rate limit is per location, not a global hard limit. `cf deploy --dry-run` requires a different config format; Wrangler's equivalent succeeds. No deployment was performed.
```
