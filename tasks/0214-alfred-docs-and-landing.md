---
id: "0214"
title: Update docs, README, and landing page for Alfred workflow status
status: doing
milestone: M23
depends: ["0213"]
---

## Goal

Update `README.md`, `docs/`, the `/docs/` site (`examples/browser-demo/docs-site.ts`),
and the landing page (`examples/browser-demo/landing.ts`) to reflect Blast's
first-class Alfred workflow support and measured compatibility status after M21
and M22 (#47 closed, follow-ups in #139).

## Context

Milestones M21 (`0205`–`0210`) and M22 (`0211`–`0213`) shipped `@blastlauncher/alfred`
and wired Alfred workflows (`.alfredworkflow` archives and unpacked directories)
into the engine, CLI, `blast serve`, `blast-tui`, and release builds. Measured
with `bun run alfred:analyze` against 242 valid real Alfred workflows:

- **39** supported Alfred object types + **35** core Automation Tasks
- **242 / 242** parse with valid Blast manifests
- **223 / 242** expose runnable entries
- **177 / 242** are fully supported (zero unsupported objects)
- **97.7%** execution-node coverage (3,959 / 4,051 non-passive objects)
- Remaining items tracked in https://github.com/BlastLauncher/blast/issues/139

Currently `README.md`, `docs/quickstart.md`, `docs/embedding.md`, the `/docs/`
sidebar (`examples/browser-demo/docs-site.ts`), and the landing page
(`examples/browser-demo/landing.ts`) still describe Blast as Raycast-only and
do not expose `docs/alfred.md` on the docs site.

## Acceptance

1. **`README.md`**:
   - Intro and `## What Blast handles` note that Blast runs both unmodified
     Raycast extensions and Alfred workflows (unpacked folders or
     `.alfredworkflow` archives) on the same views and brokered capabilities.
   - `## Receipts and status` includes the measured Alfred workflow numbers
     above (linking to `./docs/alfred.md` and issue `#139`).
   - `## Packages` table includes `alfred` (`@blastlauncher/alfred`).
   - Keeps `` `3.0.0-alpha.10` is `latest` on npm `` unchanged so the release
     version check in `examples/browser-demo/site.test.ts` stays green.
2. **Docs (`docs/quickstart.md`, `docs/embedding.md`, `docs/alfred.md`)**:
   - `docs/quickstart.md` (≤ 120 lines) notes that `extensionDir` /
     `extension.open` also accepts an Alfred workflow directory or
     `.alfredworkflow` archive, linking to `[alfred.md](./alfred.md)`. Keeps
     `` `3.0.0-alpha.10` is `latest` on npm `` unchanged.
   - `docs/embedding.md` (≤ 150 lines) notes that Blast runs unmodified Raycast
     extensions and Alfred workflows (`[alfred.md](alfred.md)`).
   - `docs/alfred.md` stays concise (≤ 125 lines) and notes the measured status
     (39 object types + 35 core Automation Tasks, 97.7% execution coverage /
     177 of 242 workflows fully supported) with a link to
     `https://github.com/BlastLauncher/blast/issues/139` for remaining items.
3. **Docs site (`examples/browser-demo/docs-site.ts` and `docs-site.test.ts`)**:
   - Add `{ slug: "alfred", summary: "Run unpacked Alfred workflows and `.alfredworkflow` archives." }`
     to `docChapters` (between `tui` and `architecture`).
   - Update the `/docs/` overview paragraph to mention both Raycast extensions
     and Alfred workflows.
   - All `docs-site.test.ts` assertions pass (including link/anchor resolution
     for `/docs/alfred/`).
4. **Landing page (`examples/browser-demo/landing.ts`, `site.test.ts`, `site-e2e.ts`)**:
   - Update `<title>` and `<meta name="description">` to cover Raycast
     extensions and Alfred workflows.
   - Hero `.pill` links to `${alfredDocsUrl}` (`/docs/alfred/`) with
     `<b>${escapeHtml(releaseVersion)}</b> Alfred workflows now run in Blast →`.
   - Hero `<h1>` is `Raycast & Alfred, inside your app.` (balanced within
     `15ch`), and `.lede` mentions both unmodified Raycast extensions and
     Alfred workflows (`.alfredworkflow`).
   - First `.flow` card covers both (`raycast · alfred` / `Extensions & workflows`).
   - `.facts` displays a balanced 2×2 grid (`grid-template-columns: repeat(2, minmax(0, 1fr))`)
     with `@raycast/api` (`stats.coverage.percent`), `rendered`
     (`stats.rendered.toLocaleString()`), `commands tested`
     (`stats.commands.toLocaleString()`), and `alfred objects` (`97.7%`), and
     `.inst-note` links to `${alfredDocsUrl}` (`Alfred workflows`) alongside the
     coverage and sweep links.
   - No external requests, pure self-contained CSS/fonts, responsive at 360px
     with zero horizontal overflow.
   - Update `examples/browser-demo/site.test.ts` and
     `examples/browser-demo/site-e2e.ts` (including verifying `/docs/alfred/`
     renders cleanly at 360px).
5. `bun run verify` passes with zero errors and zero warnings; `bun run site:build`
   succeeds.

## Out of scope

- Publishing a new npm release or bumping `releaseVersion` (`3.0.0-alpha.10` stays
  as-is until a release task).
- Running Alfred workflows inside the browser demo sandbox (Alfred workflows
  need local processes/interpreters, unlike browser-sandboxed Raycast
  extensions).
- Editing `PLAN.md` (owned by the orchestrator).

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
