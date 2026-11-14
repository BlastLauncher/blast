# Browser demo

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

Run a Raycast extension from a URL without installing it:

```sh
bun run example:browser-demo
bun run example:browser-demo:e2e
bun run example:browser-demo:e2e -- --live
```

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH`, or `.cache/ms-playwright` in
this checkout. Install it once there with
`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright bunx playwright@1.58.0 install chromium`.

The host accepts a full GitHub tree URL or a bare extension name (which means
`raycast/extensions` on `main`). It lists the extension through GitHub's
CORS-enabled contents API and fetches source bytes from
`raw.githubusercontent.com`; a GitHub API 403 with no remaining quota is shown
as a rate-limit error. Local fixture names use the same fetch path in the
default e2e. Every file under the extension directory is fetched (apart from
`node_modules`), including binary assets. If an extension has several commands,
the command selector chooses which `src/<name>.{tsx,ts,jsx,js}` entry to run.

The host installs only non-Raycast npm dependencies, and bundles in memory with
`esbuild-wasm`. The resulting code runs in almostnode's `SandboxRuntime` in an
iframe on a different loopback origin (decision 0013). The host owns the
controller and renderer.

| Capability                                 | Browser demo behavior                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LocalStorage and internal form storage     | Backed by extension-namespaced `localStorage`, with an in-memory fallback when storage is blocked                                                                                  |
| Clipboard read, copy, clear and paste      | Uses the Clipboard API when permitted; keeps a session fallback and explains that paste needs ⌘V                                                                                   |
| `open.url`                                 | Opens a new tab with `window.open`                                                                                                                                                 |
| Command metadata and same-extension launch | Answered from the catalog; user-initiated launches take over the page, while background launches are accepted and recorded because a tab has no menu bar or background process     |
| OAuth tokens                               | Stored per extension and provider in the browser store                                                                                                                             |
| OAuth authorization and preferences        | Denied with a browser-specific explanation                                                                                                                                         |
| Applications, selection, windows and AI    | Denied because a browser tab cannot honestly provide these host services, except `applications.list`, which answers an empty list because the demo cannot enumerate installed apps |

Extension network requests still require CORS. `child_process` is unavailable in a browser and native npm modules are rejected during bundling. The demo is headless-testable, binds only to 127.0.0.1, and does not publish or persist anything.

Each command receives `/blast/support/<extension>` and `/blast/assets/<extension>`
inside almostnode's virtual filesystem. Cache data therefore lasts only for the
current sandbox session.

The published site (`bun run site:build`) opens its root list with a Showcase
section: `showcase/` is a small MIT extension written for Blast, one command
per capability (List, Detail markdown, Form, Grid, actions, feedback, storage
and menu bar). It is prebuilt with every site build, from its manifest.
`bun run site:e2e -- --screenshots <dir>` saves each showcase command in light
and dark.
