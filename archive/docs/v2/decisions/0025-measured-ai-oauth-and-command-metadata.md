# ADR 0025: Measured AI, OAuth, and command metadata boundaries

- Status: accepted
- Date: 2026-08-29

## Context

The post-Finder corpus probe identified `OAuth`, `AI`, and
`updateCommandMetadata` as the next high-impact static blockers. Their public
shapes are measurable, but each operation crosses a host-owned boundary:
model execution, browser authorization, secure token storage, and command
chrome do not belong in the transport-neutral extension adapter. The existing
capability protocol also accepts only primitive arguments and values, so
structured OAuth requests and token sets need validated JSON envelopes.

## Decision

- Route `AI.ask(prompt, options?)` through `ai.ask`. Validate the prompt,
  creativity values, model strings, and abort state before sending a primitive
  argument map. Resolve the returned promise to a validated string and expose a
  one-shot final response through the measured `.on("data")` listener shape.
  Incremental model streaming remains a future provider contract.
- Keep `AI.Model` type-compatible and runtime-extensible. Known corpus aliases
  map to their stable provider identifiers; unknown keys remain opaque symbols
  rather than making the adapter depend on a fast-changing model catalog.
- Route `OAuth.PKCEClient.authorizationRequest`, `authorize`, `setTokens`,
  `getTokens`, and `removeTokens` through explicit `oauth.*` capabilities.
  Authorization requests and token sets cross the primitive wire as validated
  JSON strings. The host owns PKCE generation, browser/redirect handling,
  provider-specific network behavior, consent, and secure token storage.
- Route `updateCommandMetadata` through `command.updateMetadata`. Support the
  measured `subtitle` string and `null` clear; encode the clear as an explicit
  `{ clear: true }` primitive argument so it cannot be confused with an omitted
  field.
- Add deterministic AI, OAuth, and command-metadata providers to the corpus
  probe and child-process fixtures. These providers prove the contract only;
  they are not production model, browser, or credential providers.

## Consequences

- Extensions using the common AI prompt path and standard OAuth client
  lifecycle can bundle and cross a validated runtime boundary without granting
  the extension direct access to host credentials or browser APIs.
- The adapter remains independent of Node, Electron, network clients, and
  secret stores. Production clients must provide explicit grants, providers,
  consent, and audit records for each operation.
- The pinned corpus probe increased end-to-end renders from 520 to 535
  extensions (16.09% to 16.56% of the full corpus); renderable-command
  coverage increased from 17.84% to 18.35%.
- The next static leaders are `Tool`, `BrowserExtension`, `ToastStyle`,
  `clearSearchBar`, and `trash`. Third-party dependency provisioning remains a
  parallel coverage constraint.
