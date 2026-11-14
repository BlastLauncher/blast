---
id: "0166"
title: Docs, README and landing page show the final embedding API
status: doing
milestone: M9
depends: ["0160", "0165"]
---

## Goal

Every doc and landing snippet shows the smaller M9 API: root view, prompts,
`hello.views`, the web package, the Python and Go embedders.

## Context

- Refresh `README.md`, `docs/quickstart.md`, `docs/embedding.md` (≤ 150
  lines; move detail to `docs/launch-prompts.md` or a new `docs/root-view.md`
  if needed), `packages/web/README.md`, and the landing snippets in
  `examples/browser-demo/landing.ts` (Python and Go tabs now match
  `examples/python-embedder`, `examples/go-embedder`; add a "Web page" tab
  using `mount()`). Remove every "coming in M9" note.
- Document what 0158 found: an embedder should fail all outstanding requests
  when the server sends a protocol `error`, and a cleared search sends
  `"text": ""` explicitly.
- Every claim must match code; copy snippets from the examples, do not write
  new APIs. The published npm `next` is still `3.0.0-alpha.1`; mark features
  that need a newer server, or say "from source" until the next prerelease.

## Acceptance

- [ ] Each quickstart path re-run (JS in-process, `blast serve` from tarballs,
      web page via `release:web:e2e`), outputs in Handoff.
- [ ] `site.test.ts` asserts the new tabs; `bun run site:e2e` passes.
- [ ] No doc mentions an API absent from the code (Handoff lists what was checked).
- [ ] `bun run verify` passes.

## Out of scope

- Code changes beyond the landing page.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
