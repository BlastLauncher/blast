---
id: "0041"
title: OAuth PKCE client
status: doing
milestone: M3
depends: []
---

## Goal

`OAuth.PKCEClient` (134 extensions) works: authorization requests are
created with real PKCE values, the authorization step goes through a host
capability (denied by default; a headless flag can answer it), and token sets
persist per extension.

## Context

- Gaps: every non-deprecated `OAuth*` path in `compat/raycast-api.json`
  (68 symbols). Read the declarations in `compat/raycast-api/index.d.ts`
  carefully: `PKCEClient` constructor options (`redirectMethod`,
  `providerName`, `providerIcon`, `providerId`, `description`),
  `authorizationRequest`, `authorize`, `setTokens`, `getTokens`,
  `removeTokens`, `TokenSet` (`isExpired`, `updatedAt`, …),
  `RedirectMethod` URLs.
- PKCE: `codeVerifier`/`codeChallenge` (S256) and `state` via `node:crypto`;
  `toURL()` builds the provider URL exactly as Raycast documents for each
  `RedirectMethod`.
- `authorize(request | { url })` → capability `oauth.authorize` with the
  URL and provider metadata; the host returns `{ authorizationCode }`. Bare
  brokers deny. Headless: `--oauth-code <code>` answers it (documented in
  `--help`); without it, deny. The scene does not need an OAuth view.
- Tokens: capability `oauth.tokens.get|set|remove`, stored by the host in the
  extension's data directory keyed by `providerId` (or provider name), never
  in the scene or logs. Mirror storage.ts (atomic writes, serialized). Treat
  token storage as part of the session's own extension scope like
  LocalStorage (no `--grant` needed), and document this in decision 0001
  item 8 (≤ 3 lines) and `docs/architecture.md`.
- Also `@raycast/utils` `OAuthService`/`withAccessToken` rely on this API —
  add one test that bundles a fixture using `OAuthService` if feasible.
- `@covers`, `compat:report`, `fmt`. Parallel workers: 0038/0039/0040 —
  avoid their files.

## Acceptance

- [ ] Runtime tests: PKCE values (challenge = base64url(sha256(verifier))),
      `toURL()` per redirect method, authorize granted/denied, token
      set/get/remove/isExpired.
- [ ] Host tests: token store scoping + atomic writes; CLI e2e with
      `--oauth-code`.
- [ ] Every non-deprecated `OAuth*` path covered or explained in Handoff.
- [ ] `bun run verify` passes.

## Out of scope

- Opening a real browser or running a local redirect server.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
