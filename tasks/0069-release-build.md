---
id: "0069"
title: Release build — emitted JS + d.ts packages, npm pack smoke on Node 24
status: review
milestone: M5
depends: []
---

## Goal

`bun run release:build` produces installable npm tarballs for the engine
packages. `bun run release:smoke` proves that a fresh Node 24 project
installing only those tarballs can run a fixture extension in-process and
through `blast serve`. Nothing is published.

## Context

- Decision `docs/decisions/0009` point 6: Node refuses to strip types under
  `node_modules`, so published packages ship emitted ESM `.js` + `.d.ts`; the
  repo keeps running sources directly.
- Packages to release: `protocol`, `runtime`, `host` (published as
  **`@blastlauncher/engine`**, per 0009), `client-core`, `native`, `serve`
  (with a `bin` named `blast-serve`), `cli` (with a `bin` named `blast`). Not
  `tui`.
- `scripts/release/build.ts`:
  - emits each package with `tsc` (`rewriteRelativeImportExtensions`,
    `declaration`, ESM, target matching Node 24) into
    `.cache/release/<pkg>/`;
  - copies `package.json`, rewriting:
    - `exports`/`bin` to `./dist/*.js` with `types`;
    - `workspace:*` to the release version;
    - `private` removed;
    - the `@blastlauncher/host` name to `@blastlauncher/engine`, including in
      dependents;
  - adds `LICENSE` and a short `README.md` (generated, a few lines);
  - runs `npm pack --pack-destination .cache/release/tarballs`.
    The version comes from `--version` (default `0.0.0-dev`). Everything stays
    in `.cache/` (gitignored). Remove stale output first.
- Runtime resolution: the host resolves `@blastlauncher/runtime/main` to spawn
  it, and the runtime maps `@raycast/api`/`react` with `registerHooks`. Make
  sure this works from `node_modules` with `.js` files. Adjust the source if a
  path assumes `.ts` (for example `import.meta.resolve` targets), without
  breaking the repo's direct-source mode.
- `scripts/release/smoke.ts` (an explicit network-allowed script, never part
  of `bun test`):
  - creates `.cache/release/smoke/` and runs `npm init -y`;
  - runs `npm install <tarballs>` (registry access is allowed here for
    third-party deps such as esbuild and react);
  - writes a tiny `smoke.mjs` that uses `createEngine` → `openExtension(<copy of fixtures/extensions/hello-list>)`
    → `launch` → waits for a scene → prints the first item title →
    `close`;
  - runs it with `node` (24), then pipes a hello/open/launch transcript into
    `npx blast-serve` and checks a `session.scene` event arrives;
  - prints installed size (`du -sh node_modules`) and the tarball sizes.
    Clean up `node_modules` after the run to keep disk low (keep the tarballs).
- Record sizes in Handoff. Note that `host` currently depends on the whole
  shared-dependency allowlist (axios, cheerio, …). Measure how much of the
  install that is, so we can decide whether to split it out (follow-up task,
  not here).
- Do not add `dist/` or `.cache/` to git. Document `release:build` and
  `release:smoke` in `docs/embedding.md` (≤ 6 lines, "Installing" section).

## Acceptance

- [x] `bun run release:build` creates 7 tarballs under
      `.cache/release/tarballs/`. `tar -tzf` on the engine tarball shows
      `dist/index.js` and `dist/index.d.ts`, and no `.ts` sources other than
      `.d.ts`.
- [x] `bun run release:smoke` passes on Node 24. Paste its output (first
      item title, serve scene event, sizes) in Handoff.
- [x] Repo direct-source mode is unchanged: `bun run verify` passes and
      `bun run blast run fixtures/extensions/hello-list index` works.

## Out of scope

- Publishing to npm, CI release workflows, single-executable builds,
  splitting the shared dependency allowlist out of the engine.

## Handoff

```text
Branch/commit: t3/release-build @ 2699f2879f5d98ea027f07f4cc188ec81b5f0dfc
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, workflow ok, test ok) in 99.0s
Done:
- Added release:build: tsc ESM JS + declarations, engine rename/import rewrites,
  versioned manifests, executable bins, license/README, protocol schema and 7 tarballs.
- Added Node 24 release:smoke covering the installed engine, blast-serve transcript
  and blast CLI; always removes smoke node_modules and reports install/tarball sizes.
- Fixed runtime package-export resolution and two declaration-emission blockers
  (OPTIONAL_API symbol annotation and exported FormContextValue); no runtime semantics changed.
- Added manifest checks and Installing docs. Verified tarball contents (engine
  index.js + index.d.ts; no TS sources or tests) and direct-source blast run.
Not done / risks: Nothing published or pushed; no new dependencies. Shared allowlist
  remains bundled in engine dependencies as requested (75.1 MiB exclusive graph;
  follow-up split is out of scope). Measured on Linux arm64 / Node v24.20.0;
  installed sizes and transitive versions can vary by platform/registry state.
```

`bun run release:smoke` output (Node v24.20.0):

```text
added 165 packages in 5s
In-process first item: apple
Serve event: session.scene (first item: apple)
CLI bin: blast run (apple)
Installed: 131M node_modules
Shared allowlist exclusive graph: 75.1 MiB allocated
Tarball: blastlauncher-cli-0.0.0-dev.tgz 13166 bytes
Tarball: blastlauncher-client-core-0.0.0-dev.tgz 15790 bytes
Tarball: blastlauncher-engine-0.0.0-dev.tgz 23367 bytes
Tarball: blastlauncher-native-0.0.0-dev.tgz 15936 bytes
Tarball: blastlauncher-protocol-0.0.0-dev.tgz 26321 bytes
Tarball: blastlauncher-runtime-0.0.0-dev.tgz 83596 bytes
Tarball: blastlauncher-serve-0.0.0-dev.tgz 4000 bytes
Removed smoke node_modules
```
