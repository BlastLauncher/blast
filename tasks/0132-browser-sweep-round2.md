---
id: "0132"
title: "Browser sweep round 2: lazy command evaluation, applications, assets in the VFS, empty-view triage"
status: todo
milestone: M8
depends: []
---

## Goal

These are the next fixes from the browser sweep, which is at 103/237 rendered
on main after 0128–0131, followed by a re-run sweep.

## Context

1. **Lazy command evaluation.** This replaces 0131's global.
   - **Problem:** browser bundles evaluate the command module as soon as the
     bundle runs, before the runtime has received `init`. So module-scope code
     sees an empty environment, e.g. `new Cache()` or `getPreferenceValues()`,
     both very common in Raycast extensions.
   - **The interim workaround:** 0131 made `packages/runtime/src/api/cache.ts`
     and `environment.ts` read `globalThis.__blastSupportPath`, set by
     `examples/browser-demo/client.ts`. Remove all three uses.
   - **Fix:** the bundle entry in `packages/host/src/browser-bundle.ts` (both
     the shared-runtime and the full-bundle entry) passes a loader, e.g.
     `start({ load: () => import(<command>) })`. esbuild's CommonJS output
     turns that into a lazy require, so the module is evaluated only when the
     runtime loads the command, after `init`. This matches desktop `main.ts`.
   - Update `examples/browser-demo/runtime-entry.ts` and the
     shared-runtime `start` to use `startBrowserRuntime({ loadCommand })`.
   - Update the 0117/0119 bundle tests that read the command from the
     bundle's exports, so they assert the loader contract instead.
   - **Test:** a fixture whose module scope calls `getPreferenceValues()` and
     `new Cache()` and renders a preference value. In `site:e2e` it shows the
     value.
2. **`applications.*`.**
   - 58 commands fail on "Applications are unavailable in a browser tab".
   - `applications.list` should return `[]`: a browser tab truthfully has no
     installed applications, and extensions then degrade, e.g. no "Open with"
     items.
   - `applications.default` and `applications.frontmost` stay denied with the
     existing messages.
   - The handlers are in `examples/browser-demo/capabilities.ts` (0128). Update
     its tests.
3. **Files and assets the extension reads at runtime.**
   - Errors seen: ENOENT on `/dataset.json`, `/symbols/data.json` and
     `/blast/assets/package.json`.
   - Load the extension's `assets/` directory, plus the non-source data files
     it reads (JSON next to `src/`, `package.json`), into the sandbox VFS at
     the extension's assets path.
   - For prebuilt bundles, include the needed files in the prebuild output, as
     a per-extension file map that is checksum-verified like the bundle, and
     write them into the VFS before execution.
   - Also handle `__dirname`/`__filename` in bundles: decide what they should
     be, document it, and test it.
4. **Triage the 53 "empty" commands.**
   - Sort them into:
     - commands legitimately empty until you type (search-first);
     - commands that need preferences or API keys;
     - menu-bar commands, which the demo should either render through the
       existing menu-bar support or classify separately as
       `unsupported-mode:menu-bar`;
     - real bugs.
   - Fix the real bugs that are cheap.
   - Make the classifier distinguish search-first-empty from broken-empty,
     e.g. a List with a search bar and `isLoading` false counts as rendered.
     Explain the rule in the report.
5. **Re-run sweep.** Run `bun run site:sweep:browser` on the result, commit the
   regenerated report and JSON, and give before (103) and after numbers in the
   Handoff with the new top signatures.

## Acceptance

- [ ] There are no `__blastSupportPath` references left.
- [ ] Tests for the module-scope fixture, the bundle loader contract,
      `applications.list` returning `[]`, assets in the VFS, and the new
      classifier rules.
- [ ] `site:e2e`, `example:browser-demo:e2e` and `bun run verify` pass.
- [ ] The re-run sweep is committed, with the numbers in the Handoff.

## Safety (hard rules)

- Headless only.
- Set `PLAYWRIGHT_BROWSERS_PATH` only in your shell; no absolute personal paths
  in files; never download Chromium.
- Stub `navigator.clipboard` and `window.open`.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only.
- Network only in build, sweep and smoke scripts.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.
- Keep `.cache` growth under about 150 MB.
- Gate commits on exit codes, not piped output.

## Out of scope

- CORS proxying.
- API keys.
- Native modules such as sqlite.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
