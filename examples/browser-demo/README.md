# Browser demo

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
controller and renderer. `clipboard.copy` is answered by the demo handler,
`open.url` uses `window.open`, and other capabilities are denied visibly.

Extension network requests still require CORS. `child_process` is unavailable in a browser and native npm modules are rejected during bundling. The demo is headless-testable, binds only to 127.0.0.1, and does not publish or persist anything.

Each command receives `/blast/support/<extension>` and `/blast/assets/<extension>`
inside almostnode's virtual filesystem. Cache data therefore lasts only for the
current sandbox session.
