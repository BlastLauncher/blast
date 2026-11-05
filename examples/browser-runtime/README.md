# Browser runtime spike

`e2e.ts` bundles almostnode's browser pieces and Blast's real React runtime, then executes the runtime bundle through almostnode's documented cross-origin sandbox API. The host and sandbox use separate `127.0.0.1` origins. The test is headless only and closes both servers and the browser in `finally`.

Run with the existing Chromium cache:

```sh
PLAYWRIGHT_BROWSERS_PATH=/Users/yukai/Projects/BlastLauncher/blast/.cache/ms-playwright bun run example:browser:e2e
```

The generated bundles are under `.cache/browser-runtime/`. The sandbox bundle uses almostnode's `Runtime` implementation with its browser child-process shim; the host bundle exposes the same `createRuntime(vfs, { sandbox })` call shape and constructs `SandboxRuntime`.
