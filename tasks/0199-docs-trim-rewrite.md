---
id: "0199"
title: Trim and rewrite the docs for readability
status: doing
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

- [ ] Each of `README.md` and `docs/*.md` (not `docs/decisions/`) is shorter
      or equal in lines; `docs/architecture.md` ≤ 150 lines.
- [ ] No prose line over 100 columns outside code fences and tables
      (report the check command you used and its output in Handoff).
- [ ] `git grep -n '\.md#'` links all resolve to existing headings (say how
      you checked).
- [ ] No stale claims: `git grep -n -i 'embedder-v1\|protocol 1\|alpha\.9\|scenePatches'`
      in `README.md` and `docs/` (excluding `docs/decisions/`) is empty.
- [ ] `bun run verify` passes.

## Out of scope

- `docs/decisions/*` (records keep their wording), `docs/performance.md` and
  `docs/release.md` (task 0198 edits those in parallel), `compat/`.
- Any code change, including the site generator.
- Editing `PLAN.md`, `AGENTS.md` or other task files.

## Handoff

Filled in by the worker when finishing:

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
