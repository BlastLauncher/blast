# Browser demo

Run a Raycast extension from a URL without installing it:

```sh
PLAYWRIGHT_BROWSERS_PATH=/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright bun run example:browser-demo
PLAYWRIGHT_BROWSERS_PATH=/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright bun run example:browser-demo:e2e
PLAYWRIGHT_BROWSERS_PATH=/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright bun run example:browser-demo:e2e -- --live
```

The host fetches source files, installs only non-Raycast npm dependencies, and bundles in memory with `esbuild-wasm`. The resulting code runs in almostnode's `SandboxRuntime` in an iframe on a different loopback origin (decision 0013). The host owns the controller and renderer. `clipboard.copy` is answered by the demo handler, `open.url` uses `window.open`, and other capabilities are denied visibly.

Extension network requests still require CORS. `child_process` is unavailable in a browser and native npm modules are rejected during bundling. The demo is headless-testable, binds only to 127.0.0.1, and does not publish or persist anything.
