/* eslint-disable @typescript-eslint/no-var-requires */
import { build } from "esbuild";
import { nodeExternalsPlugin } from "esbuild-node-externals";

build({
  entryPoints: ["index.js"],
  bundle: true,
  platform: "node",
  format: 'esm',
  outfile: "dist/index.mjs",
  plugins: [
    nodeExternalsPlugin({
      allowList: ["tempy"],
    }),
  ],
});
