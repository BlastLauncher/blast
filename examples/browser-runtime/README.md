# Browser runtime spike

See the [quickstart](../../docs/quickstart.md) for the three embedding paths.

`e2e.ts` bundles almostnode's browser pieces and Blast's real React runtime, then executes the runtime bundle through almostnode's documented cross-origin sandbox API. The host and sandbox use separate `127.0.0.1` origins. The test is headless only and closes both servers and the browser in `finally`.

```sh
bun run example:browser:e2e
```

Chromium comes from `PLAYWRIGHT_BROWSERS_PATH`, or `.cache/ms-playwright` in
this checkout. Install it once there with
`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright bunx playwright@1.58.0 install chromium`.

The generated bundles are under `.cache/browser-runtime/`. The sandbox bundle uses almostnode's `Runtime` implementation with its browser child-process shim; the host bundle exposes the same `createRuntime(vfs, { sandbox })` call shape and constructs `SandboxRuntime`.
