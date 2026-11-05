---
id: "0122"
title: Deploy the website to blast.yukai.dev and the sandbox to blastlauncher.github.io/blast-sandbox
status: doing
milestone: M8
depends: ["0121"]
---

## Goal

Every push to `main` that touches the site, the demo, the runtime or the host,
plus a manual `workflow_dispatch`, publishes the following, and a live smoke
check confirms both:

- the website: the `site:build` `www/` output (0121) at
  `https://blast.yukai.dev` via GitHub Pages (Actions source);
- the sandbox: the `sandbox/` output at
  `https://blastlauncher.github.io/blast-sandbox/`, the `gh-pages` branch of
  the public `BlastLauncher/blast-sandbox`.

## Context

- **Already set up by the orchestrator:**
  - **Pages:** `BlastLauncher/blast` has Pages with `build_type=workflow` and
    cname `blast.yukai.dev`.
  - **Sandbox repo:** `BlastLauncher/blast-sandbox` exists, holding only a
    README on `main`.
  - **Deploy key:** a write deploy key for `blast-sandbox` is stored as
    Actions secret `SANDBOX_DEPLOY_KEY` on `blast`.
- **Why the sandbox is on `github.io`:**
  - `github.io` is on the Public Suffix List, so untrusted extension code
    there cannot set cookies for `yukai.dev`;
  - it is still a different origin from the site (decision 0013).
- **Base path:**
  - the sandbox URL has a path, `/blast-sandbox/`;
  - every sandbox asset reference and the host's sandbox URL must work under
    that base;
  - extend 0121's flags if they take only bare origins, e.g. a
    `--sandbox-url` with a path.
- **Workflow `.github/workflows/site.yml`:**
  - **Pins:** pin actions by full SHA, matching the existing workflows' style,
    and use the Node and Bun versions from `ci.yml`.
  - **`build` job** (`contents: read`):
    - run `bun install --frozen-lockfile`;
    - then `bun run site:build --site-origin https://blast.yukai.dev
      --sandbox-url https://blastlauncher.github.io/blast-sandbox/`, with no
      fixtures;
    - upload `www/` with `actions/upload-pages-artifact`, and `sandbox/` as a
      normal artifact.
  - **`sandbox` job:**
    - push the sandbox artifact as a single orphan commit to `blast-sandbox`
      `gh-pages`, using `SANDBOX_DEPLOY_KEY` through `webfactory/ssh-agent`
      (pinned SHA) or plain `ssh-agent` with a literal key file under
      `$RUNNER_TEMP`;
    - force-push only that branch;
    - write the commit message `deploy <blast sha>`.
  - **`pages` job** (`pages: write`, `id-token: write`): `actions/deploy-pages`.
    It needs `sandbox` to finish first, so the site never points at a stale
    sandbox.
  - **`smoke` job, after both deploys:**
    - **Requests:** `curl` with retries, for up to about 10 minutes while Pages
      and CDN caches update:
      - `https://blast.yukai.dev/` and `/demo/` return 200 with the expected
        title;
      - the sandbox page returns 200 with `access-control-allow-origin: *`;
      - the deployed `/demo/` references the sandbox URL and the sandbox
        serves the same build id.
    - **Build id:** the `site:build` emits a `build.json` with the commit SHA
      in both directories, which makes this check possible.
    - **DNS not live yet:** if `blast.yukai.dev` does not resolve yet, the
      smoke job reports that clearly and fails. It must not pass silently.
- **After the first deploy** the orchestrator will:
  - enable Pages on `blast-sandbox` from `gh-pages`;
  - set `https_enforced` on both sites once certificates exist.

  Document these steps in `docs/release.md` under a short "Website" section.

## Acceptance

- [ ] `.github/workflows/site.yml` passes a local lint: `actionlint` if
      available, otherwise a YAML parse test in verify that checks job
      dependencies (`smoke` needs `pages` and `sandbox`; `pages` needs
      `sandbox`) and permissions per job.
- [ ] A unit test confirms `build.json` exists in both outputs with the same
      SHA, and that every sandbox asset reference is relative to its base path.
- [ ] `bun run site:e2e` still passes when the sandbox is served under a
      `/blast-sandbox/` path prefix. Add that mode to the static server.
- [ ] `docs/release.md` has the Website section.
- [ ] `bun run verify` passes.

## Safety (hard rules)

- Do not push, dispatch workflows, or change repository, Pages, secret or DNS
  settings; the orchestrator does that.
- Never write absolute personal paths into files.
- Headless only.
- 127.0.0.1 servers only, always closed.
- Never `rm -rf` a path held in a shell variable.
- Leave any untracked `~` directory alone.

## Out of scope

- A second purchased domain.
- Analytics.
- Docs pages.

## Handoff

```
Branch/commit:
Verify:
Done:
Not done / risks:
```
