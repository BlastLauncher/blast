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

- `archive/` is the frozen V1/V2 prototype. Do not read, search, import, or copy
  from it unless your task file names a specific path there as reference.
- The repo is public. Never commit secrets, tokens, personal paths, or
  extension source you are not licensed to redistribute.
- Keep disk usage minimal: no global installs, no full clones of large repos;
  use sparse/shallow fetches into `.cache/` (gitignored).
- Product code must run on Node.js 24 without a build step (type stripping).
  Use only erasable TypeScript syntax: no `enum`, `namespace` values, or
  parameter properties. Bun is the dev toolchain (install, test, scripts).
- Prefer the fewest packages that keep boundaries honest. Add a package only
  when a task requires a new runtime boundary.
- Deterministic tests only. Network access is allowed in explicit fetch scripts
  that write to `.cache/`, never in `bun test`.

## Layout

```
AGENTS.md        workflow (this file)
PLAN.md          milestones, current focus, decision log (short)
tasks/           one file per open task; deleted when done
docs/            current architecture + rare decisions (docs/decisions/)
compat/          generated Raycast API coverage — never edit by hand
packages/        product code (Node-runnable TypeScript)
scripts/         repo automation (verify, workflow checks, generators)
archive/         frozen prototype, scheduled for deletion
```

## Commands

```bash
bun install --frozen-lockfile
bun run verify          # the only gate: fmt, lint, typecheck, workflow, tests
bun run fmt             # rewrite formatting
bun test <path>         # focused tests while iterating
bun run check:workflow  # AGENTS/PLAN/tasks/docs structure and size limits
```

## Definition of done

A task is done only when all are true:

1. Every acceptance check in the task file is satisfied and demonstrated.
2. `bun run verify` passes on the final commit; paste its summary line in the
   task's Handoff section.
3. Behaviour changes have tests; API surface changes update `compat/` via its
   generator.
4. No stray files: no debug scripts, no `.only`, no commented-out code.
5. The task's Handoff section is filled in (see below).

## Tasks

File: `tasks/NNNN-short-slug.md`, four-digit id, never reused. Template:
`tasks/_template.md`. Required frontmatter: `id`, `title`, `status`
(`todo|doing|review|done`), `milestone`, `depends` (list of ids). Required
sections: `Goal`, `Context`, `Acceptance`, `Out of scope`, `Handoff`.

- A task fits in one focused session (roughly < 600 changed lines). Split
  otherwise.
- Acceptance items are concrete, checkable commands or observable results.
- When a task is merged, delete its file in the same commit and tick it in
  `PLAN.md`. Git history is the archive; there is no status ledger.

## Roles and handoff

Work is done by three roles. One agent may hold several roles, but the
reviewer must never review their own implementation.

- **Orchestrator** — owns `PLAN.md` and `tasks/`, writes task files, delegates,
  reviews results, merges into the integration branch, and pushes.
- **Worker** — implements exactly one task on its own branch/worktree.
  Does not edit `PLAN.md`, other tasks, or `AGENTS.md`; does not push. If the
  task is wrong or blocked, stop and write why in Handoff instead of
  improvising scope.
- **Reviewer** — fresh context. Checks the diff against the task's
  Acceptance and this file; reruns `bun run verify`; reports concrete findings
  (file:line, failure scenario). Does not rewrite the work.

Handoff happens through files and commits, never chat history. A worker's
final message and the task's Handoff section both contain:

```
Branch/commit: <branch> @ <sha>
Verify: <summary line of bun run verify>
Done: <what changed, 1-5 bullets>
Not done / risks: <anything skipped, assumptions, follow-ups>
```

## Delegation (orchestrator)

Branches: integration branch is `v3/restart` (later `main`). Workers commit on
their own branch; the orchestrator merges after review and pushes.

Loop per task:

1. Write/refresh the task file, set `status: doing`, **commit it** — worktree
   children start from the last local commit and do not see uncommitted edits.
2. Delegate to a worker in an isolated worktree with a prompt that says only:
   "Follow AGENTS.md. You are the Worker for `tasks/NNNN-*.md`." plus anything
   not already in the task file.
3. Review: delegate a Reviewer on a different model, or review yourself if you
   did not implement it. Check generated artifacts, not only verify. On
   findings, remove the old worktree (keep its branch) and send a new round
   with the original brief plus numbered findings; the new worker starts with
   `git merge --ff-only <previous-branch>`.
4. Merge (`--no-ff`), delete the task file, tick `PLAN.md`, run verify, push.
   Then remove the worker worktree and branch (`git worktree remove`) to
   free disk.

In T3 Code use `delegate_task` with `isolation: "worktree"`, `mode: "async"`,
a stable `clientRequestId` per round (e.g. `task-0001-r1`), and end the turn
until the completion notification arrives. Model guidance (re-check with
`orchestrator_capabilities`; names change):

| Use                                 | Provider instance    | Model                                                          |
| ----------------------------------- | -------------------- | -------------------------------------------------------------- |
| Well-specified, mechanical tasks    | `opencode_opencode2` | `opencode-go/deepseek-v4.1-flash`, `opencode-go/glm-5.3-flash` |
| Harder implementation, review       | `codex`              | `gpt-6.1-sol`                                                  |
| Orchestration, design, final review | `claudeAgent`        | `claude-opus-5-5`                                              |

Cheap models get tasks whose Acceptance is fully mechanical. If a cheap model
fails a task twice, escalate the model rather than loosening the task.

## Raycast API coverage

- The denominator is every exported declaration (and member) of the latest
  published `@raycast/api` `types/index.d.ts`, pinned in `compat/`.
- Evidence comes from tests: a test that exercises an API declares it with a
  `// @covers <Symbol.path>` comment. The generator joins inventory, evidence
  and corpus usage weights into `compat/raycast-api.json` and
  `compat/COVERAGE.md`.
- `bun run verify` fails if `compat/` is stale. Never hand-edit `compat/`.
- Tracking the latest API is a regeneration plus a review of the diff, recorded
  in the commit message.

## Docs policy

- `docs/architecture.md` describes what exists now, not history (≤ 200 lines).
- `docs/decisions/NNNN-*.md` only for choices that are expensive to reverse
  (wire protocol, trust boundary, process model). ≤ 60 lines each. Most work
  needs no decision record.
- No status ledgers, changelogs of agent sessions, or per-symbol decision
  files. Progress lives in `PLAN.md` checkboxes and git history.

## Code conventions

- ESM, TypeScript, strict. Explicit `.ts` extensions in relative imports.
- Tests sit next to code as `*.test.ts` and use `bun:test`.
- Comments explain why, not what. Match surrounding style.
- Commit messages: conventional (`feat:`, `fix:`, `chore:`, `test:`, `docs:`),
  referencing the task id, e.g. `feat(0003): headless scene snapshot`.
