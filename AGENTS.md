# Blast — agent guide

This file is the single source of truth for how work happens in this repository.
Every agent (any vendor, any model) follows it. Keep it short; it is enforced by
`bun run check:workflow`.

## Mission

Blast is a small, open, portable host that runs Raycast-compatible extensions
outside Raycast. The launcher UI is only one client; the core is a headless
runtime that loads an extension command, renders its React tree into a
serializable scene, routes user events back, and brokers privileged host
operations. Compatibility is measured against the latest `@raycast/api`, never
claimed.

## Start here (every session)

1. Read this file, then `PLAN.md` (current milestone and next tasks).
2. `ls tasks/` — open the task you were given, or pick the lowest-numbered
   `status: todo` task whose `depends` are all done.
3. `bun install --frozen-lockfile && bun run verify` before changing anything.
   If verify is red on a clean tree, fixing it is the first task.

## Ground rules

- The V1/V2 prototype lives only in tag `archive/v2-prototype-2026-10-18`; ignore it.
- The repo is public. Never commit secrets, tokens, personal paths, or
  extension source you are not licensed to redistribute.
- Keep disk usage minimal: no global installs, no full clones of large repos;
  use sparse/shallow fetches into `.cache/` (gitignored).
- Product code must run on Node.js 24 without a build step (type stripping);
  only `packages/tui` may require Bun (decision 0009). Erasable TypeScript
  only: no `enum`, `namespace` values, or parameter properties.
  Bun is the dev toolchain (install, test, scripts).
- Prefer the fewest packages that keep boundaries honest. Add a package only
  when a task requires a new runtime boundary.
- New dependencies: check `npm view <pkg> version` and pin that exact latest
  version; do not trust remembered versions. Justify each one in Handoff.
- Raycast extension corpus: only through `bun run corpus:*` scripts — shallow,
  blobless, sparse clones of `raycast/extensions` into `.cache/`. Never clone
  it fully, never `npm install` inside an extension, never modify extension
  source; incompatibilities are fixed in Blast.
- Deterministic, order-independent tests only (verify randomizes order; reproduce
  with `--seed`). Never throw from React commit callbacks. Network only in fetch
  scripts that write to `.cache/`, never in `bun test`.

## Layout

```
AGENTS.md        workflow (this file)
PLAN.md          milestones, current focus, decision log (short)
tasks/           one file per open task; deleted when done
docs/            architecture, capabilities, CLI, TUI, rare decisions/
compat/          generated Raycast API coverage — never edit by hand
packages/        product code (Node-runnable TypeScript)
scripts/         repo automation (verify, workflow checks, generators)
```

## Commands

```bash
bun install --frozen-lockfile
bun run verify          # the only gate: fmt, lint, typecheck, workflow, tests
bun run fmt             # rewrite formatting
bun test <path>         # focused tests while iterating
bun run check:workflow  # AGENTS/PLAN/tasks/docs structure and size limits
```

Never gate a commit on `bun run verify | tail` without `set -o pipefail`: the
pipe hides the failure.

## Definition of done

A task is done only when all are true:

1. Every acceptance check in the task file is satisfied and demonstrated.
2. `bun run verify` passes on the final commit; its summary line is in Handoff.
3. Behaviour changes have tests; API surface changes regenerate `compat/`.
4. No stray files: no debug scripts, no `.only`, no commented-out code.
5. The task's Handoff section is filled in (see below).

## Tasks

File: `tasks/NNNN-short-slug.md`, four-digit id, never reused. Template:
`tasks/_template.md`. Required frontmatter: `id`, `title`, `status`
(`todo|doing|review|done`), `milestone`, `depends` (list of ids). Required
sections: `Goal`, `Context`, `Acceptance`, `Out of scope`, `Handoff`.

- A task fits in one focused session (roughly < 600 changed lines), else split.
- Acceptance items are concrete, checkable commands or observable results.
- When a task is merged, delete its file in the same commit and tick it in
  `PLAN.md`. Git history is the archive; there is no status ledger.

## Roles and handoff

Work is done by three roles. One agent may hold several roles, but the
reviewer must never review their own implementation.

- **Orchestrator** — owns `PLAN.md`, `tasks/` and this file, writes task files,
  delegates, reviews, opens one PR per task and merges it once CI is green.
- **Worker** — implements exactly one task on its own branch/worktree.
  Does not edit `PLAN.md`, other tasks, or `AGENTS.md`; does not push. If the
  task is wrong or blocked, stop and write why in Handoff instead of
  improvising scope.
- **Reviewer** — fresh context. Checks the diff against the task's
  Acceptance and this file; reruns `bun run verify`; reports concrete findings
  (file:line, failure scenario). Does not rewrite the work.

Handoff happens through files, commits and PRs, never chat history. A worker's
final message and the task's Handoff section (copied into the PR body) contain:

```
Branch/commit: <branch> @ <sha>
Verify: <summary line of bun run verify>
Done: <what changed, 1-5 bullets>
Not done / risks: <anything skipped, assumptions, follow-ups>
```

## Delegation (orchestrator)

Branches: `main` changes only through pull requests; never push to it. Each
task gets a branch `task/NNNN-slug` from `origin/main` and one PR (tightly
coupled tasks may share one; say so in both task files). Workers branch off it.

Loop per task (the primary checkout stays on `main` throughout):

1. Write the task file (`status: todo`), then `bun run tasks:start NNNN`: it
   creates the task branch in its own worktree, `.cache/tasks/NNNN-slug`, and
   commits the file there as `doing` (children see only commits).
2. Delegate a worker with the output of `bun run tasks:brief NNNN --role worker`
   (add `--avoid <path>` for files a parallel task owns) plus anything not in
   the task file. Briefs carry the standard rules; do not retype them.
3. Review: delegate `--role reviewer --from <worker-branch>` on a different
   model, or review yourself if you did not implement it. Check generated
   artifacts, not only verify. On findings, send a new round with
   `--role worker --from <previous-branch> --round N --findings <file>`.
4. Land: `--role land --from <worker-branch>`. `tasks:merge NNNN` (from any
   checkout) merges the worker branch `--no-ff`, ticks PLAN.md, verifies and
   commits done (`--resume` after a failed verify). `tasks:land NNNN` merges
   `origin/main` (checkbox-only PLAN conflicts resolve themselves), pushes,
   opens the PR, waits for green checks, merges, updates local `main` without
   switching it and removes the task worktree. `bun run tasks:clean` lists
   leftover worktrees and branches; `--apply` removes them when no child runs.

Independent tasks run in parallel on their own task branches; land one at a
time. Regenerate conflicting `compat/` files and `bun.lock` (`bun install`),
never hand-merge. UI tasks get before/after screenshots in the PR body.

In T3 Code use `delegate_task` (`isolation: "worktree"`; land children
`"shared"`; `mode: "async"`, stable `clientRequestId` per round, e.g.
`task-0001-r1`) and end the turn until it completes. Land children link their
PR, so merges settle them, never the orchestrator thread. Models (names change):

| Use                                 | Provider instance      | Model                                                                                         |
| ----------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------- |
| Well-specified, mechanical tasks    | `opencode_2`           | `opencode-go/deepseek-v4.1-flash`, `opencode-go/glm-5.3-flash`, free `opencode/*-free` models |
| Harder implementation, review       | `codex`; `antigravity` | `gpt-6.1-sol`; `gemini-4-neon` or `gemini-4-hydrogen` (`thought_level: high`)                 |
| Large migrations; fallback          | `claudeAgent`          | `claude-sonnet-5-5`                                                                           |
| Interface and visual design         | `antigravity`          | `gemini-4-hydrogen`, `thought_level: high`                                                    |
| Orchestration, design, final review | `claudeAgent`          | `claude-opus-5-5`                                                                             |

Cheap models get tasks whose Acceptance is fully mechanical. If a cheap model
fails a task twice, escalate the model rather than loosening the task.

## Raycast API coverage

- Denominator: every public symbol path in the latest published
  `@raycast/api` declarations, vendored in `compat/raycast-api/`
  (`bun run compat:fetch [version]`) and listed by `bun run compat:inventory`.
- Evidence: a test in `packages/**/*.test.ts(x)` that exercises an API declares
  it with `// @covers <Symbol.path>` (append ` partial` when incomplete).
  `bun run compat:report` writes `compat/raycast-api.json` and
  `compat/COVERAGE.md`; the headline is non-deprecated coverage.
- `bun run verify` fails if anything in `compat/` is stale or a tag names an
  unknown path. Never hand-edit `compat/`.
- Upgrading the API = `compat:fetch` → `compat:inventory` → `compat:report`,
  then review the inventory diff and record notable changes in the commit.

## Docs policy

- `docs/architecture.md` describes what exists now, not history (≤ 200 lines).
- `docs/decisions/NNNN-*.md` only for choices that are expensive to reverse
  (wire protocol, trust boundary, process model). ≤ 60 lines each. Most work
  needs no decision record.
- No status ledgers, changelogs of agent sessions, or per-symbol decision
  files. Progress lives in `PLAN.md` checkboxes and git history.

## Code conventions

- ESM, TypeScript, strict. Explicit `.ts` extensions in relative imports.
- A package is `packages/<name>/` with `package.json` name
  `@blastlauncher/<name>`, `"private": true`, `"type": "module"`, `exports`
  pointing at `./src/*.ts` (no build step), and internal deps as
  `"workspace:*"`. Read `docs/architecture.md` and `docs/decisions/` first.
- Non-product test fixtures live under `fixtures/` (excluded from typecheck).
- Tests sit next to code as `*.test.ts` and use `bun:test`.
- Comments explain why, not what. Match surrounding style.
- Commit messages: conventional (`feat:`, `fix:`, `chore:`, `test:`, `docs:`),
  referencing the task id, e.g. `feat(0003): headless scene snapshot`.
