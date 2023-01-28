/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

esbuild.build({
  entryPoints: ["index.js"],
  bundle: true,
  platform: "node",
  outfile: "dist/index.cjs",
  plugins: [nodeExternalsPlugin()],
});
