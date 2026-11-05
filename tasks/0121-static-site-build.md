---
id: "0121"
title: Static website build (landing + /demo) and a separate sandbox build for GitHub Pages
status: doing
milestone: M8
depends: []
---

## Goal

`bun run site:build` produces two static directories, ready for two GitHub
Pages sites on two origins (decision 0013):

- `.cache/site/www/`: a landing page at `/` and the browser demo at `/demo/`.
- `.cache/site/sandbox/`: only the almostnode sandbox page and its bundle.

The origins are build inputs, so the same build serves local testing and the
real domains:

- `--site-origin`, which also drives the CNAME;
- `--sandbox-origin`.

## Context

- **Current demo:** `examples/browser-demo/main.ts` is a dev server that builds
  and serves assets on the fly: `/client.js`, `/blast-sources.json`,
  `/catalog.json`, `/almostnode.mjs`, `/esbuild.wasm`, plus the sandbox server.
  - Split the build from the serving: one function emits the static files.
  - The dev server and `site:build` both use it, so the e2e exercises the
    shipped bytes.
- **Absolute paths:**
  - Every asset URL the client uses must be relative to the page or derived
    from the configured origins.
  - Nothing may assume `127.0.0.1` or a root path. The demo lives at `/demo/`.
- **Sandbox origin output:**
  - `index.html`, i.e. what almostnode's `SandboxRuntime` loads, plus
    `almostnode-full.mjs`.
  - It needs `Access-Control-Allow-Origin: *`, which GitHub Pages sends by
    default.
  - Also emit a `_headers` file listing `Access-Control-Allow-Origin` and
    `Cross-Origin-Resource-Policy: cross-origin`, for hosts that read it. It is
    harmless on Pages.
- **Both directories:**
  - `.nojekyll`;
  - a `CNAME` file when the origin is a custom domain, omitted for
    `*.github.io` or localhost;
  - a `404.html`.
- **Landing page (`/`):**
  - **Content:** our own design. It explains:
    - what Blast is: an embeddable engine that runs Raycast extensions outside
      Raycast;
    - the two ways to embed: in process, and `blast serve`;
    - npm install snippets: `@blastlauncher/engine@next` and
      `@blastlauncher/client-core@next`;
    - honest status: alpha, with coverage and sweep numbers from
      `compat/COVERAGE.md` and `compat/SWEEP.md`, generated at build time and
      not hard-coded;
    - links to GitHub, `docs/embedding.md` on GitHub, and the demo.
  - **No branding:** no Raycast logos or brand assets. Say "compatible with
    Raycast extensions"; it must not look like Raycast's site.
  - **Constraints:** responsive, light and dark, no external fonts or scripts,
    and a tiny CSS file. Accessible: landmarks, contrast, keyboard focus.
- **Pure helpers:** origin parsing and validation, CNAME decisions, and stats
  extraction from `compat/*.md`. Unit-test them in verify.
- **Other files:**
  - `.cache/` is already gitignored; the build output stays out of git.
  - No new runtime dependencies. The esbuild-wasm, almostnode and Playwright
    pins stay in the demo's e2e and dependency path.

## Acceptance

- [ ] `bun run site:build --site-origin http://127.0.0.1:<a> --sandbox-origin
      http://127.0.0.1:<b>` writes both directories. A file listing with sizes
      goes in the Handoff.
- [ ] A new e2e, `bun run site:e2e`:
  - [ ] builds the site;
  - [ ] serves `www/` and `sandbox/` with a dumb static file server, with no
        app logic, on two 127.0.0.1 ports;
  - [ ] loads `/` and checks the landing page renders, with headings and
        working links to `/demo/`;
  - [ ] then runs the 0120 root-list flow against `/demo/`: filter, run the
        fixture command, real first scene, Esc back.
  - The fixture extensions must therefore be part of the build behind a
    `--fixtures` flag that real builds omit.
- [ ] The existing `example:browser-demo:e2e` still passes.
- [ ] Unit tests for the pure helpers.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Headless only, with `PLAYWRIGHT_BROWSERS_PATH` from the environment. Never
  write any absolute personal path into a file; `check:workflow` rejects it.
- 127.0.0.1 servers only, always closed.
- No deployment, no GitHub Pages settings, no DNS changes, and no pushes.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- The deploy workflows and the second repository (task 0122, once the domain is
  known).
- Docs pages.
- Analytics.

## Handoff

Branch/commit: t3/build-static-landing-page @ 611aea10f3268882184ea3778e1e8b1e08a86983
Verify: verify: PASS (format ok, lint ok, typecheck ok, compat ok, protocol ok, mac-fixtures ok, workflow ok, test ok) in 63.7s
Done:

- Added `site:build` to emit the landing page, `/demo/`, and the separate almostnode sandbox with origin-aware URLs, CNAME rules, headers, 404 pages, and `.nojekyll` markers.
- Added generated coverage and sweep stats, responsive light/dark accessible landing content, npm snippets, and GitHub/demo/documentation links.
- Refactored the existing browser demo to use the same static browser assets and relative paths, retaining the dev server and its e2e.
- Added pure helper tests and `site:e2e`, including static serving and the fixture root-list → command → scene → Esc flow.

Build listing (`site:build --site-origin http://127.0.0.1:4175 --sandbox-origin http://127.0.0.1:4176`):

- `www/index.html` 6299 B; `www/site.css` 104 B; `www/404.html` 104 B; `www/.nojekyll` 0 B
- `www/demo/index.html` 342 B; `client.js` 299605 B; `almostnode.mjs` 22276 B; `blast-sources.json` 3160373 B; `catalog.json` 36413 B; `esbuild.wasm` 13978850 B
- `sandbox/index.html` 474 B; `almostnode-full.mjs` 594521 B; `_headers` 81 B; `404.html` 40 B; `.nojekyll` 0 B

Not done / risks: GitHub Pages deployment, DNS, and workflow changes remain intentionally out of scope for task 0122.
