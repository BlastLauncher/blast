---
id: "0124"
title: Fix the live demo (styles, icons, DataCloneError, fixture lookup) and smoke it in a real browser
status: doing
milestone: M8
depends: []
---

## Goal

`https://blast.yukai.dev/demo/` works like the local dev demo:

- styled;
- with real icons;
- picking a catalog command renders its first scene.

The deploy's smoke job proves this in headless Chromium against the live URLs.

## Context

A headless run against the deployed site, which the orchestrator performed
after 0122, found these bugs while the curl smoke check passed:

1. **No styles.**
   - `examples/browser-demo/site.ts` writes a bare `/demo/index.html` with no
     stylesheet. The styled page exists only in the dev server's `html()` in
     `main.ts`.
   - Make one page template, with one stylesheet as a file and not inline, so
     the CSP in the web launcher stays possible. Both the dev server and
     `site:build` must emit it.
   - Add a test that the built `/demo/index.html` links the stylesheet and
     that the stylesheet exists in `www/demo/`.
2. **Broken icons.**
   - Catalog icon URLs point at `extensions/<name>/<icon>`, but Raycast
     manifests resolve `icon` relative to `assets/`. Every icon 404s, and the
     browser blocks the 404 HTML (`ERR_BLOCKED_BY_ORB`).
   - Fix this in the catalog generator (`scripts/browser-catalog.ts`), or
     wherever the URL is built, and regenerate `catalog.json`.
   - Test that a known catalog entry's icon URL contains
     `/extensions/<name>/assets/`.
   - Keep the neutral fallback glyph for icons that fail to load. It must not
     show the alt text, as it does today ("icon.png").
3. **`DataCloneError`, so no scene.**
   - `client.ts` calls `runtime.execute(bundled.code, "/bundle.cjs")`.
     almostnode's `SandboxRuntime` posts the evaluation result, the module's
     exports, back to the page. Those exports contain the command function
     (`function calculateRatio…`), which cannot be cloned, so execute rejects.
     On the live site the command never rendered.
   - Make the evaluated code finish with a cloneable value, e.g. append a final
     `module.exports = null;`, or wrap the bundle so `execute` returns
     `undefined`.
   - Treat any execute rejection as fatal, and surface it clearly in the
     status bar.
   - Find out why the fixture e2e never hit this, and make the e2e fail when
     it happens.
4. **Fixture lookup in production.**
   - `client.ts` first fetches `fixtures/<name>/__files`, which is a 404 on the
     live site, for every `raycast/extensions@main` source.
   - Only builds made with `--fixtures` may try local fixtures. Production
     builds must go straight to GitHub.
5. **The tests never ran a production build in a browser.**
   - Add `bun run site:smoke:browser <site-url> <sandbox-url>`: headless
     Chromium against any deployed or local URLs, with `navigator.clipboard`
     and `window.open` stubbed. It asserts:
     - the landing page renders with its stylesheet applied, e.g. a computed
       style differs from the browser default;
     - `/demo/` shows the root list with at least 200 options, styled;
     - at least one icon image loaded, with `naturalWidth > 0`;
     - typing `ratio` and pressing Enter renders the command's first scene: a
       form or list from the real `ratio-calculator`, not a status error;
     - no `pageerror` or `DataCloneError` occurred;
     - the sandbox iframe's origin is the sandbox URL's origin.
   - Run it in the `smoke` job of `.github/workflows/site.yml` after the curl
     checks. Install Chromium there with
     `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright@<pinned>
     install --with-deps chromium`.
   - Also run it locally against a production build, without `--fixtures`,
     served by the static server. It needs network for GitHub and npm.

- **Setup:** a local Playwright package sits under
  `.cache/browser-demo/deps` after any demo run.
- **Output:** screenshots from `site:smoke:browser` go to `.cache/site-smoke/`,
  and CI uploads them as an artifact.

## Acceptance

- [ ] Unit tests for items 1, 2 and 4.
- [ ] `bun run site:e2e` (fixtures) passes and fails on any execute rejection.
- [ ] `bun run site:smoke:browser` passes against a local production build. It
      renders `ratio-calculator` through real GitHub sources. The Handoff
      records timings.
- [ ] `site.yml`'s smoke job runs `site:smoke:browser` against the deployed
      URLs. Workflow tests are updated.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only.
- Never write absolute personal paths into files. Set `PLAYWRIGHT_BROWSERS_PATH`
  only in your shell, and never download Chromium locally.
- Never touch the real clipboard or open real windows; stub them.
- No pushes, deploys or settings changes.
- 127.0.0.1 servers only, always closed.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- Redesigning the demo.
- New features.
- Download size.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
