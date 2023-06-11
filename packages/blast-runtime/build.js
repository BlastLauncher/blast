/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require("esbuild");

esbuild.build({
  entryPoints: ["./src/run.ts"],
  bundle: true,
  platform: "node",
  outfile: "dist/run.cjs",
  keepNames: true,
});
