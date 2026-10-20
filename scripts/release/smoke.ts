// Explicit network-enabled check; never imported by bun test.
import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { output, packages, root, run } from "./build.ts";

const smoke = join(output, "smoke");
if (!run("node", ["--version"]).startsWith("v24."))
  throw new Error("Release smoke requires Node 24");
const tarballs = (await readdir(join(output, "tarballs")))
  .filter((file) => file.endsWith(".tgz"))
  .toSorted();
if (tarballs.length !== packages.length)
  throw new Error("Run release:build first (expected 7 tarballs)");
await rm(smoke, { recursive: true, force: true });
await mkdir(smoke, { recursive: true });
try {
  run("npm", ["init", "-y"], smoke);
  console.log(
    run(
      "npm",
      [
        "install",
        "--no-audit",
        "--no-fund",
        ...tarballs.map((file) => join(output, "tarballs", file)),
      ],
      smoke,
    ),
  );
  await cp(join(root, "fixtures/extensions/hello-list"), join(smoke, "hello-list"), {
    recursive: true,
  });
  await cp(new URL("./smoke-program.mjs", import.meta.url), join(smoke, "smoke.mjs"));
  console.log(run("node", ["smoke.mjs"], smoke));
  console.log(`Installed: ${run("du", ["-sh", "node_modules"], smoke)}`);
  // Attribute the hoisted dependency graph to the shared allowlist, excluding
  // packages also needed by the core (esbuild, semver, React and the runtime).
  const lock = JSON.parse(await readFile(join(smoke, "package-lock.json"), "utf8"));
  const graph = lock.packages as Record<
    string,
    { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
  >;
  const locate = (from: string, name: string): string => {
    let parent = from;
    while (true) {
      const candidate = `${parent ? `${parent}/` : ""}node_modules/${name}`;
      if (graph[candidate]) return candidate;
      const index = parent.lastIndexOf("node_modules/");
      if (index < 0) throw new Error(`Missing installed dependency: ${name}`);
      parent = parent.slice(0, index).replace(/\/$/, "");
    }
  };
  const closure = (names: string[]) => {
    const found = new Set<string>();
    const visit = (path: string) => {
      if (found.has(path)) return;
      found.add(path);
      for (const name of Object.keys(graph[path]?.dependencies ?? {})) visit(locate(path, name));
      for (const name of Object.keys(graph[path]?.optionalDependencies ?? {})) {
        // Platform-specific optional packages may be present only in the lock.
        try {
          visit(locate(path, name));
        } catch {
          /* absent optional dependency */
        }
      }
    };
    for (const name of names) visit(locate("node_modules/@blastlauncher/engine", name));
    return found;
  };
  const engine = graph["node_modules/@blastlauncher/engine"]!;
  const coreNames = ["@blastlauncher/protocol", "@blastlauncher/runtime", "esbuild", "semver"];
  const core = closure(coreNames);
  const shared = closure(
    Object.keys(engine.dependencies!).filter((name) => !coreNames.includes(name)),
  );
  const exclusive = [...shared].filter((path) => !core.has(path));
  // Count each installed directory once, including nested packages only via its parent.
  const dirs = exclusive.filter((path) => !exclusive.some((other) => path.startsWith(`${other}/`)));
  let kib = 0;
  for (const path of dirs) {
    try {
      await stat(join(smoke, path));
    } catch {
      continue;
    }
    kib += Number(run("du", ["-sk", path], smoke).split(/\s/)[0]);
  }
  console.log(`Shared allowlist exclusive graph: ${(kib / 1024).toFixed(1)} MiB allocated`);
  for (const file of tarballs)
    console.log(`Tarball: ${file} ${(await stat(join(output, "tarballs", file))).size} bytes`);
} finally {
  await rm(join(smoke, "node_modules"), { recursive: true, force: true });
  console.log("Removed smoke node_modules");
}
