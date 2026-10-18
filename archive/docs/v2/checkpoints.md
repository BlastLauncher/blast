# V2 experimental checkpoints

This runbook preserves a working V2 experiment without presenting its entire
history as a polished merge unit. A checkpoint is immutable reference material,
not a release, a support promise, or proof that the foundation is complete.

## Current checkpoint

- Recorded: 2026-09-03
- Source branch: `codex/v2-session-state-machine`
- Source tip before this documentation: `f306a7d5154f0304eb0aefe2a8cb201853019748`
- Snapshot branch: `archive/v2-exploration-2026-09-03`
- Purpose: preserve the executable V2 foundation, compatibility experiments,
  Electron client work, tests, and supporting evidence as one known baseline.

The snapshot is intentionally broader than the original session-state-machine
story. It contains both foundational boundaries and the first substantial V2
implementation. Treat unresolved items in `status.md` as experimental debt;
do not infer production readiness from the checkpoint name.

## Create and verify a checkpoint

Start only from a clean, synchronized source branch. Commit the checkpoint
documentation before creating the archive branch so the instructions travel
with the snapshot.

```bash
git status --short --branch
git fetch --prune origin
git rev-parse HEAD
git rev-parse '@{upstream}'

git branch archive/v2-exploration-YYYY-MM-DD HEAD
git push --set-upstream origin archive/v2-exploration-YYYY-MM-DD
git ls-remote --exit-code --heads origin archive/v2-exploration-YYYY-MM-DD
```

The two `rev-parse` results must match before checkpoint documentation is
committed. After documentation is committed, create the snapshot at that new
tip. Never force-push, rebase, or delete an archive branch. If a correction is
needed, create a newly dated checkpoint.

## Resume development

Do not rebuild V2 by cherry-picking its interdependent commits individually.
Use one of these approaches:

1. For the lowest-risk continuation, branch directly from the checkpoint.

   ```bash
   git fetch origin
   git switch -c v2/integration \
     origin/archive/v2-exploration-2026-09-03
   ```

2. If a compact history is worth losing commit-level archaeology, preserve the
   archive and import its complete diff once onto `origin/main`.

   ```bash
   git fetch origin
   git switch -c v2/integration origin/main
   git merge --squash origin/archive/v2-exploration-2026-09-03
   git commit -m "feat: establish executable V2 experimental baseline"
   ```

New bounded feature branches should target `v2/integration`. Keep the archive
read-only and use it to answer historical questions or recover discarded work.

## Small-agent handoff

For a bounded follow-up, give an agent this order of work:

1. Read the repository `AGENTS.md`, this file, `README.md`, and `status.md`.
2. Confirm the checked-out branch and a clean worktree before editing.
3. Make only the requested change; do not rewrite the archive or restart V2.
4. Update durable V2 documentation only when behavior or a boundary changes.
5. Run the narrowest relevant tests, then report changed files and results.

Escalate architectural, trust, compatibility-policy, or cross-package contract
changes for deeper review instead of inferring a new direction from nearby code.
