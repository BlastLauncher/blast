---
id: "0199"
title: Trim and rewrite the docs for readability
status: review
milestone: M18
depends: []
---

## Goal

`README.md` and `docs/*.md` read cleanly for a newcomer: shorter, plainly
worded, no very long lines, each fact in one place, and every statement still
true of the code today.

## Context

- Files and line counts: `README.md` 116, `docs/architecture.md` 188 (limit
  200, many lines over 100 columns, up to ~700), `capabilities.md` 138,
  `embedding.md` 137, `cli.md` 119, `tui.md` 116, `quickstart.md` 114,
  `release.md` 70, `performance.md` 54, `root-view.md` 45,
  `launch-prompts.md` 45, `walkthroughs/*.md`. Size limits are enforced by
  `scripts/check-workflow.ts`; aim well under them.
- `docs/architecture.md` "describes what exists now, not history"
  (AGENTS.md Docs policy). It currently mixes overview with API detail that
  also lives in `embedding.md` / `cli.md`; keep the overview and link out.
- The site renders these as `/docs/<slug>/` chapters
  (`examples/browser-demo/docs-site.ts`, `docChapters`), and GitHub heading
  ids are used as anchors. Keep the file names and slugs; if you rename a
  heading, fix every `file.md#anchor` link to it (`git grep -n '\.md#'`).
- Recent changes the docs must state correctly: embedder protocol 2
  (decision 0020: full view then `*.view.patch`, resync, scenes only with
  `hello.scenes`, views are state), always-on runtime `scene.patch` (0019),
  standby runtime pool, `3.0.0-alpha.10` as npm `latest`, `@next` canaries
  from `main` merges that touch packages. Check claims against the code and
  `docs/decisions/`, not memory.
- Style: short sentences, active voice, wrap prose at ~80 columns, code and
  commands in fences, tables only where they compare things. Comments in
  docs explain why, not history. No marketing adjectives.
- `bun run verify` checks doc sizes and the site build tests; run it.

## Acceptance

- [x] Each of `README.md` and `docs/*.md` (not `docs/decisions/`) is shorter
      or equal in lines; `docs/architecture.md` ≤ 150 lines.
- [x] No prose line over 100 columns outside code fences and tables
      (report the check command you used and its output in Handoff).
- [x] `git grep -n '\.md#'` links all resolve to existing headings (say how
      you checked).
- [x] No stale claims: `git grep -n -i 'embedder-v1\|protocol 1\|alpha\.9\|scenePatches'`
      in `README.md` and `docs/` (excluding `docs/decisions/`) is empty.
- [x] `bun run verify` passes.

## Out of scope

- `docs/decisions/*` (records keep their wording), `docs/performance.md` and
  `docs/release.md` (task 0198 edits those in parallel), `compat/`.
- Any code change, including the site generator.
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit: t3/fix-docs-trim-facts @ 342671b6 (plus handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 109.5s
Done:
- Fixed all 6 blocking facts across the trimmed docs: `hello.scenes` gates only `session.scene` (`session.log` is always sent) in `docs/embedding.md`; only `--ai-answer`, `--browser-tabs`, and `--browser-bridge` set `environment.canAccess` in `docs/cli.md`; `availableAPIs` sits under `init.environment` in `docs/architecture.md`; `Ctrl-P` opens a dropdown when present and otherwise moves up in a List in `docs/tui.md`; `preferences.open` is denied by the engine unless an embedder handles it in `docs/capabilities.md`; and `⌘⇧,` (`Ctrl+Shift+,` off macOS) is Configure Command's shortcut in `docs/root-view.md`.
- Fixed all 6 nits and restored dropped details: `tpm` detection, `no-view` close/return vs `--popup`/direct quit, 3 s non-animated toast auto-dismiss (animated stays), exit code 1 only if last launched command crashed, and `List.EmptyView`/`Grid.EmptyView` `No results` fallback in `docs/tui.md`; `revision` +1 per event, `root.resync {root}` / `session.resync {session}`, out-of-order responses, and `missing_values`/`missing_dependencies` errors in `docs/embedding.md`; `{ "type": "noul", "noul": 0.8 }` shape in `docs/cli.md`; `launch(target)` resolving to `{ exited }` in `docs/root-view.md`; `openExtension`'s `savePreferences` & `MissingLaunchValuesError`, `bundleCommand`'s `os.tmpdir()/blast/builds` default & cache invalidation, `LaunchProps.draftValues` hydration + shutdown form flush, and `blast deps` two-pass peer repair in `docs/architecture.md`.
- Line-count & width check: Python check across `README.md`, `docs/*.md` (excluding `performance.md`, `release.md`), and `docs/walkthroughs/*.md` reported `bad_counts: []` and `bad_lines: []` (> 100 cols); `docs/architecture.md` 147 (≤ 150, was 188), `docs/capabilities.md` 100 (was 138), `docs/cli.md` 112 (was 119), `docs/embedding.md` 136 (was 137), `docs/root-view.md` 44 (was 45), `docs/tui.md` 111 (was 116).
- Anchor & stale-term check: `git grep -n '\.md#' -- README.md 'docs/' ':!docs/decisions/'` returned only `README.md:47:[tmux palette](./docs/tui.md#tmux-palette)`; `git grep -n -i 'embedder-v1\|protocol 1\|alpha\.9\|scenePatches' -- README.md 'docs/' ':!docs/decisions/'` returned nothing.
Not done / risks:
- `docs/performance.md` and `docs/release.md` were left untouched (owned by parallel task 0198).
```
