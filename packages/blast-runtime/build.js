/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require("esbuild");
const { nodeExternalsPlugin } = require("esbuild-node-externals");

esbuild.build({
  entryPoints: ["./src/run.ts"],
  bundle: true,
  platform: "node",
  outfile: "dist/run.cjs",
  keepNames: true,
  plugins: [
    nodeExternalsPlugin({
      // packagePath: "./package.json",
      // allowList: ["@blastlauncher/api", "react"],
      // allowList: ["react"]
      dependencies: false,
      // allowList: ["react", "@raycast/api", "react-reconciler", "@blastlauncher/api", "@blastlauncher/renderer"]
    }),
  ],
});
