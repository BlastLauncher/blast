/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require("esbuild");
// const { nodeExternalsPlugin } = require("esbuild-node-externals");

esbuild.build({
  entryPoints: ["./src/run.ts"],
  bundle: true,
  platform: "node",
  outfile: "dist/run.cjs",
  plugins: [
  ],
});
