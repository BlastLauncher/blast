import { readFileSync } from "node:fs";

export type UpgradeDecision = {
  needed: boolean;
  branch: string;
  issueTitle: string;
  compareUrl: string;
};

function versionParts(version: string): number[] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) throw new Error(`invalid semver: ${version}`);
  return match.slice(1).map(Number);
}

export function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index++) {
    if (a[index]! !== b[index]!) return a[index]! < b[index]! ? -1 : 1;
  }
  return 0;
}

export function decideUpgrade(
  current: string,
  latest: string,
  repository = "blastlauncher/blast",
  base = "main",
): UpgradeDecision {
  // Only stable releases are vendored: an rc tagged `latest` by mistake must
  // not open an upgrade issue.
  const needed = !/[-+]/.test(latest) && compareVersions(current, latest) < 0;
  const branch = `compat/raycast-api-${latest}`;
  return {
    needed,
    branch,
    issueTitle: `Upgrade @raycast/api to ${latest}`,
    compareUrl: `https://github.com/${repository}/compare/${base}...${branch}`,
  };
}

async function latestVersion(): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/@raycast/api", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`registry request failed: ${response.status}`);
  const metadata = (await response.json()) as { "dist-tags"?: { latest?: unknown } };
  const latest = metadata["dist-tags"]?.latest;
  if (typeof latest !== "string") throw new Error("registry metadata has no latest version");
  return latest;
}

if (import.meta.main) {
  const source = JSON.parse(readFileSync("compat/raycast-api/source.json", "utf8")) as {
    version?: unknown;
  };
  const latest = process.argv[2] ?? (await latestVersion());
  const current = typeof source.version === "string" ? source.version : "";
  const decision = decideUpgrade(
    current,
    latest,
    process.env.GITHUB_REPOSITORY ?? "blastlauncher/blast",
    process.env.GITHUB_BASE_REF || "main",
  );
  console.log(`latest=${latest}`);
  for (const [key, value] of Object.entries(decision)) console.log(`${key}=${value}`);
}
