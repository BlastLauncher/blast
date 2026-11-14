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

- [x] Each quickstart path re-run (JS in-process, `blast serve` from tarballs,
      web page via `release:web:e2e`), outputs in Handoff.
- [x] `site.test.ts` asserts the new tabs; `bun run site:e2e` passes.
- [x] No doc mentions an API absent from the code (Handoff lists what was checked).
- [x] `bun run verify` passes.

## Out of scope

- Code changes beyond the landing page.

## Handoff

```
Branch/commit: t3/refresh-final-docs @ 5628601 (this handoff commit on top)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 148.5s
Done:
- docs/embedding.md (146 lines) leads with hello views → extension.open → root.open → root.input/session.input;
  client rules: fail all outstanding requests on a protocol `error`, a cleared search sends `"text":""`;
  new docs/root-view.md holds the root detail; availability note: these APIs are newer than 3.0.0-alpha.1.
- docs/quickstart.md, README.md, packages/web/README.md: engine.root, the any-language root flow and the web
  package, installed from `release:build` tarballs ("from source") until the next prerelease; no "planned in M9".
- landing.ts: JS (engine.root), new "Web page" tab (mount()), Go/Python/Swift copied from go-embedder,
  python-embedder and LauncherApp (OpenRoot / root.open / openRoot), NDJSON and hero wire on root.open; copy
  and install section say "from source". Only new CSS: #tab-web added to the three existing selector lists.
  site.test.ts asserts all 6 tabs and their snippets and rejects pre-M9 calls; site-e2e clicks the Web page tab.
- Also fixed (stale after 0165): examples/macos-launcher/README.md (no command picker or CommandPickerTests;
  BlastKit snippet uses openRoot) and examples/web-launcher/README.md (engine.root, not createController).
Not done / risks:
- Quickstart runs (all against .cache/release/tarballs from release:build):
  JS in-process (npm install tarballs/*.tgz, docs' index.mjs) printed "Commands: hello-list,index", then
  "hello-list: apple,banana,cherry"; the command keeps running until Ctrl-C (the doc says so).
  blast serve (npx blast-serve): welcome; extension.open → {"extension":"2"}; root.view; root.open → {"root":"1"};
  root.input primary → root.launched session "3", session.view "hello-list"; back → session.exited 0, then root.view.
  A search input with no `text` → {"type":"error","error":{"code":"invalid_message",…}} and no response.
  Python: `python3 -I examples/python-embedder/embedder.py fixtures/extensions/hello-list` drew the root and the search.
  Web: release:web:e2e → {"pass":true,"row":"apple","pageLines":11}. site:e2e → {"pass":true,"browser":"chromium",…}.
- Checked against code: EmbedderParams/EmbedderMessage in packages/protocol/src/embedder.ts (methods, hello views,
  input shapes); serve events (root.view, root.launched, session.view/scene/log/exited) and protocolError;
  host exports (createEngine, engine.root → Root {view,subscribe,input,ready,close}, RootOptions.launch,
  startLaunchFlow → {view,subscribe,input,opened,cancel}, ExtensionHandle manifest/dependencies/preferences/launch);
  client-core createController; native createNativeHandlers; broker CapabilityContext {signal,progress};
  serve --dependencies manual|auto; web mount/WebMountOptions (root, sandboxUrl, assetsUrl)/WebMount;
  Go Start/Open/OpenRoot/Input/textPointer; Python Client.request/input/shutdown/root;
  BlastKit openRoot/sendInput(_:root:)/BlastEvent.rootView/.rootLaunched/.exited.
- Not documented (0168 owns them): prompt `required`, configure `scope`. docs/launch-prompts.md unchanged.
- The Python example only prints a protocol `error`; the docs name the Go example as the one that fails
  outstanding requests. Changing the Python example is code, out of scope here.
- Quickstart and landing say "from source" for the M9 APIs; update to `@next` after the next prerelease.
```
