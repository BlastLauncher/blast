// Explicit network-enabled check; never imported by bun test.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { output, packages, root, run } from "./build.ts";

const smoke = join(output, "smoke");
if (!run("node", ["--version"]).startsWith("v24."))
  throw new Error("Release smoke requires Node 24");
const tarballs = (await readdir(join(output, "tarballs")))
  .filter((file) => file.endsWith(".tgz"))
  .toSorted();
if (tarballs.length !== packages.length)
  throw new Error("Run release:build first (expected 8 tarballs)");
await rm(smoke, { recursive: true, force: true });
await mkdir(smoke, { recursive: true });
try {
  run("npm", ["init", "-y"], smoke);
  const install = (files: string[]) =>
    console.log(
      run(
        "npm",
        [
          "install",
          "--no-audit",
          "--no-fund",
          ...files.map((file) => join(output, "tarballs", file)),
        ],
        smoke,
      ),
    );
  const slim = tarballs.filter((file) => /^blastlauncher-(engine|runtime|protocol)-/.test(file));
  if (slim.length !== 3) throw new Error("Missing slim engine tarballs");
  install(slim);
  const lock = JSON.parse(await readFile(join(smoke, "package-lock.json"), "utf8"));
  for (const name of ["shared-deps", "cli", "serve"])
    if (lock.packages[`node_modules/@blastlauncher/${name}`])
      throw new Error(`Unexpected slim dependency: ${name}`);
  if (lock.packages["node_modules/lodash"]) throw new Error("Shared library in slim engine");
  await cp(join(root, "fixtures/extensions/hello-list"), join(smoke, "hello-list"), {
    recursive: true,
  });
  await cp(new URL("./smoke-program.mjs", import.meta.url), join(smoke, "smoke.mjs"));
  console.log(run("node", ["smoke.mjs", "hello-list", "apple", "--engine-only"], smoke));
  console.log(
    `Slim engine installed: ${run("du", ["-sh", "node_modules"], smoke)} (${run("du", ["-sk", "node_modules"], smoke).split(/\s/)[0]} KiB allocated)`,
  );
  const shared = tarballs.filter((file) => file.startsWith("blastlauncher-shared-deps-"));
  install(shared);
  console.log(
    `With shared-deps installed: ${run("du", ["-sh", "node_modules"], smoke)} (${run("du", ["-sk", "node_modules"], smoke).split(/\s/)[0]} KiB allocated)`,
  );
  const fixture = join(smoke, "shared-fixture");
  await mkdir(join(fixture, "src"), { recursive: true });
  await writeFile(
    join(fixture, "package.json"),
    JSON.stringify({
      name: "shared-fixture",
      commands: [{ name: "index", mode: "view" }],
      dependencies: { lodash: "^4" },
    }),
  );
  await writeFile(
    join(fixture, "src/index.tsx"),
    `
    import { List } from "@raycast/api";
    import lodash from "lodash";
    export default function Command() {
      return <List><List.Item title={lodash.camelCase("shared dependency")} /></List>;
    }
  `,
  );
  console.log(
    run("node", ["smoke.mjs", "shared-fixture", "sharedDependency", "--engine-only"], smoke),
  );
  install(tarballs.filter((file) => !slim.includes(file) && !shared.includes(file)));
  console.log(run("node", ["smoke.mjs"], smoke));
  for (const file of tarballs)
    console.log(`Tarball: ${file} ${(await stat(join(output, "tarballs", file))).size} bytes`);
} finally {
  await rm(join(smoke, "node_modules"), { recursive: true, force: true });
  console.log("Removed smoke node_modules");
}
