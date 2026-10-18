import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(packageDirectory, "dist");

await build({
  bundle: true,
  entryPoints: [path.join(distDirectory, "bootstrap.js")],
  external: ["esbuild", "react"],
  format: "cjs",
  outfile: path.join(distDirectory, "v2-bootstrap.cjs"),
  platform: "node",
  target: "node20",
});

await build({
  bundle: true,
  entryPoints: [path.join(distDirectory, "adapter-entry.js")],
  external: ["react"],
  format: "cjs",
  outfile: path.join(distDirectory, "v2-raycast-api.cjs"),
  platform: "node",
  target: "node20",
});
