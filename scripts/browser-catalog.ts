import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const smoke = JSON.parse(await readFile(join(root, "compat/smoke.json"), "utf8")) as {
  commit: string;
  results: Array<{ extension: string; command: string; mode: string; outcome: string }>;
};
const deps = JSON.parse(await readFile(join(root, "compat/corpus-deps.json"), "utf8")) as {
  commit: string;
  extensions: Array<{ name: string; dependencies: string[] }>;
};
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
const blocked = new Set(
  deps.extensions
    .filter((item) =>
      item.dependencies.some(
        (dependency) =>
          denied.has(dependency) || /(^|-)native(-|$)|node-gyp|robotjs|sharp/.test(dependency),
      ),
    )
    .map((item) => item.name),
);
const rendered = smoke.results.filter(
  (item) => item.outcome === "rendered" && !blocked.has(item.extension),
);
const byExtension = new Map<string, Set<string>>();
for (const item of rendered)
  byExtension.set(item.extension, (byExtension.get(item.extension) ?? new Set()).add(item.command));
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
console.log(
  `browser catalog: ${extensions.length} extensions, ${extensions.reduce((total, extension) => total + extension.commands.length, 0)} commands; denied native/shell dependencies: ${[...denied].toSorted().join(", ")}`,
);
