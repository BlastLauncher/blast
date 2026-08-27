const esbuild = require("esbuild");
const path = require("node:path");

const watch = process.argv.includes("--watch");

const esbuildConfig = {
  entryPoints: ["./src/run.ts"],
  bundle: true,
  platform: "node",
  outfile: "dist/run.cjs",
  alias: {
    "@raycast/api": path.resolve(__dirname, "../../apps/electron-client/node_modules/@raycast/api/dist/index.js"),
  },
  keepNames: true,
  define: { "import.meta.url": "_importMetaUrl" },
  banner: {
    js: "const _importMetaUrl=require('url').pathToFileURL(__filename)",
  },
};

if (watch) {
  esbuild.context(esbuildConfig).then((ctx) => {
    ctx.watch();
  });
} else {
  esbuild.build(esbuildConfig).catch(() => process.exit(1));
}
