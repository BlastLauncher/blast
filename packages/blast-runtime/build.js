/* eslint-disable @typescript-eslint/no-var-requires */
const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const esbuildConfig = {
  entryPoints: ["./src/run.ts"],
  bundle: true,
  platform: "node",
  outfile: "dist/run.cjs",
  keepNames: true,
};

if (watch) {
  esbuild.context(esbuildConfig).then((ctx) => {
    ctx.watch()
  });
} else {
  esbuild.build(esbuildConfig).catch(() => process.exit(1));
}
