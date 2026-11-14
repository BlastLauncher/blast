import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  exclusions,
  markdown,
  type Exclusion,
  type Report,
} from "../examples/browser-demo/sweep-report.ts";

type SmokeResult = { extension: string; command: string; mode: string; outcome: string };

const denied = new Set([
  "execa",
  "run-applescript",
  "node-pty",
  "shelljs",
  "fkill",
  "open",
  "sudo-prompt",
  "child_process",
]);
export function isBrowserCatalogBlocked(dependencies: readonly string[]): boolean {
  return dependencies.some(
    (dependency) =>
      denied.has(dependency) || /(^|-)native(-|$)|node-gyp|robotjs|sharp/.test(dependency),
  );
}

/**
 * Commands the demo may list: rendered in the Node corpus smoke, free of
 * native/shell dependencies, and not excluded as a browser limit by a sweep.
 */
export function catalogCommands(
  smoke: readonly SmokeResult[],
  dependencies: readonly { name: string; dependencies: string[] }[],
  excluded: readonly Exclusion[],
): Map<string, Set<string>> {
  const blocked = new Set(
    dependencies
      .filter((item) => isBrowserCatalogBlocked(item.dependencies))
      .map((item) => item.name),
  );
  const dropped = new Set(excluded.map((item) => `${item.extension}/${item.command}`));
  const byExtension = new Map<string, Set<string>>();
  for (const item of smoke) {
    if (item.outcome !== "rendered" || blocked.has(item.extension)) continue;
    if (dropped.has(`${item.extension}/${item.command}`)) continue;
    byExtension.set(
      item.extension,
      (byExtension.get(item.extension) ?? new Set()).add(item.command),
    );
  }
  return byExtension;
}

async function main() {
  const root = process.cwd();
  const smoke = JSON.parse(await readFile(join(root, "compat/smoke.json"), "utf8")) as {
    commit: string;
    results: SmokeResult[];
  };
  const deps = JSON.parse(await readFile(join(root, "compat/corpus-deps.json"), "utf8")) as {
    commit: string;
    extensions: Array<{ name: string; dependencies: string[] }>;
  };
  const sweepPath = join(root, "compat/browser-sweep.json");
  const sweep = existsSync(sweepPath)
    ? (JSON.parse(await readFile(sweepPath, "utf8")) as Report)
    : undefined;
  const excluded = sweep ? exclusions(sweep) : [];
  const byExtension = catalogCommands(smoke.results, deps.extensions, excluded);
  const fetchManifest = async (name: string) => {
    const response = await fetch(
      `https://raw.githubusercontent.com/raycast/extensions/${smoke.commit}/extensions/${name}/package.json`,
    );
    if (!response.ok) throw new Error(`Unable to fetch ${name} package.json (${response.status})`);
    return (await response.json()) as {
      title?: string;
      description?: string;
      icon?: string;
      commands?: Array<{ name?: string; title?: string; subtitle?: string; mode?: string }>;
    };
  };
  const extensions = [];
  for (const name of [...byExtension.keys()].toSorted()) {
    const manifest = await fetchManifest(name);
    const allowed = byExtension.get(name)!;
    const commands = (manifest.commands ?? [])
      .filter((command) => typeof command.name === "string" && allowed.has(command.name))
      .map((command) => ({
        name: command.name!,
        title: command.title ?? command.name!,
        mode: command.mode ?? "view",
        ...(command.subtitle ? { subtitle: command.subtitle } : {}),
      }))
      .toSorted((a, b) => a.name.localeCompare(b.name));
    if (commands.length)
      extensions.push({
        name,
        title: manifest.title ?? name,
        ...(manifest.description ? { description: manifest.description } : {}),
        ...(manifest.icon ? { icon: manifest.icon } : {}),
        commands,
      });
  }
  await writeFile(
    join(root, "examples/browser-demo/catalog.json"),
    `${JSON.stringify({ commit: smoke.commit, extensions }, null, 2)}\n`,
  );
  if (sweep) {
    // The sweep report says what left the demo and why; the next sweep keeps
    // the list, since it no longer runs those commands.
    const report: Report = { ...sweep, excluded };
    await writeFile(sweepPath, `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(join(root, "compat/BROWSER-SWEEP.md"), markdown(report));
  }
  console.log(
    `browser catalog: ${extensions.length} extensions, ${extensions.reduce((total, extension) => total + extension.commands.length, 0)} commands; ${excluded.length} excluded as browser-limit; denied native/shell dependencies: ${[...denied].toSorted().join(", ")}`,
  );
}

if (import.meta.main) await main();
