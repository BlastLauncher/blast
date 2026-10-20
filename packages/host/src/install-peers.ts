import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Range, minVersion, rcompare, satisfies, valid } from "semver";

export function supplied(name: string): boolean {
  return name === "@raycast/api" || /^react(?:\/|$)/.test(name) || name.startsWith("@types/");
}

async function manifest(directory: string) {
  try {
    return JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function* packages(directory: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.name.startsWith("@")) {
      yield* packages(path);
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      yield path;
      // Do not follow local-package symlinks into unrelated dependency trees.
      if (entry.isDirectory()) yield* packages(join(path, "node_modules"));
    }
  }
}

function lockedVersions(lock: string | undefined, name: string): string[] {
  if (lock === undefined) return [];
  const parsed = JSON.parse(lock);
  const versions = new Set<string>();
  for (const [path, entry] of Object.entries(parsed.packages ?? {})) {
    if (path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)) {
      const version = (entry as { version?: string }).version;
      if (version && valid(version)) versions.add(version);
    }
  }
  const visit = (
    dependencies: Record<string, { version?: string; dependencies?: typeof dependencies }>,
  ) => {
    for (const [key, entry] of Object.entries(dependencies)) {
      if (key === name && entry.version && valid(entry.version)) versions.add(entry.version);
      if (entry.dependencies) visit(entry.dependencies);
    }
  };
  visit(parsed.dependencies ?? {});
  return [...versions].toSorted(rcompare);
}

/** Intersect comparator sets, including each branch of union ranges. */
function intersection(ranges: string[]): string | undefined {
  let combinations = [""];
  for (const range of ranges) {
    const sets = new Range(range).set;
    combinations = combinations.flatMap((left) =>
      sets.map((set) => `${left} ${set.map((item) => item.value).join(" ")}`.trim()),
    );
  }
  const possible = combinations.filter((range) => {
    const minimum = minVersion(range);
    return minimum !== null && ranges.every((constraint) => satisfies(minimum, constraint));
  });
  return possible.length ? possible.join(" || ") || "*" : undefined;
}

/** Disk-only peer discovery. npm remains responsible for fetching selected versions. */
export async function requiredPeerAdditions(
  directory: string,
  lock: string | undefined,
  onLog?: (message: string) => void,
): Promise<Record<string, string>> {
  const required = new Map<string, { ranges: Set<string>; missing: boolean }>();
  for await (const path of packages(join(directory, "node_modules"))) {
    const pkg = await manifest(path);
    for (const [name, range] of Object.entries(pkg?.peerDependencies ?? {})) {
      if (supplied(name) || pkg.peerDependenciesMeta?.[name]?.optional === true) continue;
      const peer = required.get(name) ?? { ranges: new Set<string>(), missing: false };
      peer.ranges.add(String(range));
      let installed;
      for (let ancestor = path; ; ancestor = dirname(ancestor)) {
        installed = await manifest(join(ancestor, "node_modules", name));
        if (installed || ancestor === directory) break;
      }
      try {
        peer.missing ||= !installed?.version || !satisfies(installed.version, String(range));
      } catch {
        peer.missing = true;
      }
      required.set(name, peer);
    }
  }
  const additions: Record<string, string> = {};
  for (const [name, peer] of [...required].toSorted(([a], [b]) => a.localeCompare(b))) {
    if (!peer.missing) continue;
    const ranges = [...peer.ranges].toSorted();
    try {
      const range = intersection(ranges);
      if (range === undefined) throw new Error("conflicting ranges");
      additions[name] =
        lockedVersions(lock, name).find((version) => satisfies(version, range)) ?? range;
    } catch {
      onLog?.(`Warning: cannot resolve required peer ${name} (${ranges.join("; ")}).`);
    }
  }
  return additions;
}
