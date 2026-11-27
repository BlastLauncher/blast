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
Branch/commit: t3/trim-rewrite-docs @ faa46665 (plus handoff commit)
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 140.2s
Done:
- Trimmed and rewrote `README.md` (115 lines, was 116), `docs/architecture.md` (135 lines, was 188), `docs/capabilities.md` (98, was 138), `docs/cli.md` (111, was 119), `docs/embedding.md` (136, was 137), `docs/launch-prompts.md` (41, was 45), `docs/quickstart.md` (110, was 114), `docs/root-view.md` (44, was 45), `docs/tui.md` (104, was 116), and `docs/walkthroughs/*.md` (24 each, was 24).
- Removed duplicated API/flag details from `docs/architecture.md` and `docs/capabilities.md` in favor of links, and verified kept claims against code and `docs/decisions/` (updated TUI key docs to `Ctrl-A` action panel / `Ctrl-P`/`Ctrl-K`/`Ctrl-N`/`Ctrl-J` list movement / `Ctrl-E` configure, `hello.scenes`, `*.view.patch` + resync, always-on `scene.patch`, standby runtime pool, and `3.0.0-alpha.10` as npm `latest`).
- Width & line-count check: Python script scanning `README.md`, `docs/*.md`, and `docs/walkthroughs/*.md` outside fenced code blocks and `|` tables reported `bad_counts: []` and `bad_lines: []` (> 100 cols).
- Anchor & stale-term check: `git grep -n '\.md#' -- README.md 'docs/' ':!docs/decisions/'` returned only `README.md:47:[tmux palette](./docs/tui.md#tmux-palette)` (plus `examples/browser-demo/README.md:47` linking `docs/embedding.md#network-proxy`), verified against `## tmux palette` / `## Network proxy` and `bun test examples/browser-demo/docs-site.test.ts`; `git grep -n -i 'embedder-v1\|protocol 1\|alpha\.9\|scenePatches' -- README.md 'docs/' ':!docs/decisions/'` returned nothing.
Not done / risks:
- `docs/performance.md` and `docs/release.md` were left untouched (owned by parallel task 0198).
```
