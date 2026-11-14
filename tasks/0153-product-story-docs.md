---
id: "0153"
title: "Product story: README, docs/quickstart.md, docs/embedding.md"
status: doing
milestone: M9
depends: ["0152"]
---

## Goal

A newcomer understands in one screen what Blast is (an engine that renders
Raycast extensions inside _your_ app, in any language, through one small
protocol) and can run an extension in their own code within five minutes by
following `docs/quickstart.md`.

## Context

- Positioning (decision 0014, 0009): Blast is the engine, not a launcher.
  Lead with: "Raycast extensions in any app. Draw views, forward input,
  answer the capabilities you grant." Three ways in, same contract:
  1. try it: the browser demo at https://blast.yukai.dev/demo/ (no install);
  2. JS/TS in-process: `@blastlauncher/engine` + `@blastlauncher/client-core`;
  3. any language: spawn `blast serve` (npm `@blastlauncher/serve@next`,
     bin `blast-serve`), NDJSON over stdio, opt into views.
- Today's API only; tasks 0155–0157 will shrink it later and update these
  snippets. Every snippet must actually run against today's code: base the JS
  one on `examples/web-launcher` / `packages/host`, the wire one on
  `docs/embedding.md` transcript and `examples/go-embedder/main.go`.
- README (`README.md`): keep it short. Order: one-paragraph pitch; 3-path
  "Try / Embed in JS / Embed in any language" with ≤ 15-line snippets;
  "What the engine does for you vs what you do" (two short lists: engine:
  build, deps, sandboxed process per command, Raycast client semantics,
  storage/OAuth; you: pixels, the capabilities you grant); receipts
  (coverage, sweep, links to `compat/`); status (alpha, npm `next`);
  packages table; development; history (one paragraph). Drop the long
  milestone-by-milestone "Where it stands" list (PLAN.md has it).
- `docs/quickstart.md` (new, ≤ 120 lines; add it to `LINE_LIMITS` in
  `scripts/check-workflow.ts`): three sections matching the paths, each
  copy-paste runnable from an empty directory with npm, ending with "next:
  capabilities, views reference, examples".
- `docs/embedding.md` (≤ 150 lines) becomes the reference: concepts (engine,
  extension, session, view, input, capability), the in-process API, the
  serve protocol with the views transcript first and scenes second, and the
  capability contract. Remove the "Installing from local tarballs" framing
  (move release-tarball notes to `docs/release.md` if still useful).
- Examples READMEs: one line each at the top saying what it demonstrates and
  the language, linking back to quickstart.

## Acceptance

- [ ] `README.md` ≤ 140 lines; first 25 lines contain the pitch and the three paths.
- [ ] `docs/quickstart.md` exists, in `LINE_LIMITS`, ≤ 120 lines.
- [ ] Handoff shows each quickstart path executed from a temp dir under
      `.cache/` against local release tarballs (`bun run release:build`,
      `npm install <tarballs>`), with the command output's last lines.
- [ ] No doc claims features that do not exist yet (root view, prompts as
      views, web package): those appear only as "coming in M9" at most once.
- [ ] `bun run verify` passes.

## Out of scope

- Landing page (0154), engine code, decision records, renaming packages.

## Handoff

```
Branch/commit: t3/product-story-docs @ 7426d2931a9ca8d399af5234f8fd22da3aca02ec
Verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok); 1034 pass, 2 skipped.
Done:
- Reframed README around the engine product story and three embed paths; added receipts, package roles, status, development, and history.
- Added `docs/quickstart.md` with browser, JS/TS tarball, and any-language stdio paths.
- Reworked `docs/embedding.md` into the current views-first, scenes-second protocol and in-process/capability reference.
- Added quickstart links to every example README and registered its 120-line workflow limit.
- Executed JS and `blast-serve` quickstart checks from `.cache/quickstart-*` using `bun run release:build` tarballs.
Not done / risks: Task 0155 may change `blast serve` defaults and icon/view fields; this documents the behavior present on this branch as requested.
```
