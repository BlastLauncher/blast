import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { packages, root } from "./build.ts";

export type ReleasePackage = {
  id: string;
  name: string;
  dependencies?: Record<string, string>;
};

export type PublishPlanEntry = ReleasePackage & { alreadyPublished: boolean };

const VERSION_PATTERN =
  /^(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)-(?<channel>alpha|beta|rc)\.(?<number>0|[1-9]\d*)(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validatePrereleaseVersion(version: string): string {
  const match = VERSION_PATTERN.exec(version);
  if (!match || Number(match.groups?.major) !== 3)
    throw new Error(
      `Version must be a v3 semver pre-release such as 3.0.0-alpha.1, got: ${version}`,
    );
  return version;
}

export function tagForVersion(version: string): string {
  return `v${validatePrereleaseVersion(version)}`;
}

export function assertTagAvailable(version: string, tagExists: (tag: string) => boolean): string {
  const tag = tagForVersion(version);
  if (tagExists(tag)) throw new Error(`Release tag already exists: ${tag}`);
  return tag;
}

export function orderByDependencies(source: readonly ReleasePackage[]): ReleasePackage[] {
  const byName = new Map(source.map((pkg) => [pkg.name, pkg]));
  const order = new Map(source.map((pkg, index) => [pkg.id, index]));
  const pending = new Set(source);
  const result: ReleasePackage[] = [];

  while (pending.size) {
    const ready = [...pending]
      .filter((pkg) =>
        Object.keys(pkg.dependencies ?? {}).every((dependency) => {
          const target =
            dependency === "@blastlauncher/host" ? "@blastlauncher/engine" : dependency;
          return !byName.has(target) || result.some((done) => done.name === target);
        }),
      )
      .toSorted((left, right) => order.get(left.id)! - order.get(right.id)!);
    if (!ready.length) throw new Error("Release package dependencies contain a cycle");
    const pkg = ready[0]!;
    pending.delete(pkg);
    result.push(pkg);
  }
  return result;
}

export async function buildPublishPlan(
  version: string,
  source: readonly ReleasePackage[],
  versionExists: (packageName: string, version: string) => Promise<boolean>,
): Promise<PublishPlanEntry[]> {
  validatePrereleaseVersion(version);
  const ordered = orderByDependencies(source);
  const plan: PublishPlanEntry[] = [];
  for (const pkg of ordered)
    plan.push({ ...pkg, alreadyPublished: await versionExists(pkg.name, version) });
  return plan;
}

export function assertPublishToken(token: string | undefined): asserts token is string {
  if (!token?.trim()) throw new Error("NPM_TOKEN is required for a real prerelease publish");
}

export async function readReleasePackages(): Promise<ReleasePackage[]> {
  const result: ReleasePackage[] = [];
  for (const id of packages) {
    const source = JSON.parse(
      await readFile(join(root, "packages", id, "package.json"), "utf8"),
    ) as Record<string, unknown>;
    const sourceName = String(source.name);
    const pkg: ReleasePackage = {
      id,
      name: sourceName.replace("@blastlauncher/host", "@blastlauncher/engine"),
    };
    if (source.dependencies && typeof source.dependencies === "object")
      pkg.dependencies = source.dependencies as Record<string, string>;
    result.push(pkg);
  }
  return result;
}

export function npmVersionExists(packageName: string, version: string): boolean {
  const result = spawnSync("npm", ["view", `${packageName}@${version}`, "version"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return result.stdout.trim() === version;
  const error = result.stderr.trim();
  if (/\bE404\b|\b404\b/.test(error)) return false;
  throw new Error(`Unable to query npm for ${packageName}@${version}: ${error || "npm failed"}`);
}

export function remoteTagExists(tag: string): boolean {
  const result = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--refs", "origin", `refs/tags/${tag}`],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status === 0) return true;
  if (result.status === 2) return false;
  throw new Error(`Unable to check whether ${tag} exists: ${result.stderr.trim() || "git failed"}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      version: { type: "string" },
      output: { type: "string" },
    },
  });
  const mode = positionals[0] ?? "plan";
  if (mode === "require-token") {
    assertPublishToken(process.env.NPM_TOKEN);
    return;
  }
  const version = values.version;
  if (typeof version !== "string") throw new Error("--version is required");
  const tag = assertTagAvailable(version, remoteTagExists);
  if (mode === "validate") {
    console.log(`version=${version}\ntag=${tag}`);
    return;
  }
  if (mode !== "plan") throw new Error(`Unknown release mode: ${mode}`);
  const plan = await buildPublishPlan(version, await readReleasePackages(), async (name, value) =>
    npmVersionExists(name, value),
  );
  const publish = plan.filter((entry) => !entry.alreadyPublished).map((entry) => entry.name);
  const lines = [`version=${version}`, `tag=${tag}`, `publish_packages=${publish.join(" ")}`];
  if (typeof values.output === "string") await writeFile(values.output, `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

if (import.meta.main) await main();
