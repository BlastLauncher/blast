import { useEffect, useState } from "react";
import { Action, ActionPanel, Icon, List, Toast, showToast } from "@raycast/api";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadConfig, saveConfig, type InstalledExtension } from "./config.ts";

const run = promisify(execFile);
const catalogUrl = "https://api.github.com/repos/raycast/extensions/contents/extensions";
const dataRoot = () => {
  const home = process.env.HOME ?? process.cwd();
  return join(process.env.XDG_DATA_HOME ?? join(home, ".local", "share"), "blast", "extensions");
};

type CatalogEntry = { name: string; type: string };

async function catalog(): Promise<CatalogEntry[]> {
  // GitHub rate-limits anonymous contents requests aggressively. When the
  // user has GitHub CLI authentication, use it so the catalog works from a
  // tmux server even after the anonymous quota is exhausted.
  try {
    const { stdout: rootSha } = await run("gh", [
      "api",
      "repos/raycast/extensions/git/trees/main",
      "--jq",
      '.tree[] | select(.path == "extensions") | .sha',
    ]);
    const { stdout } = await run("gh", [
      "api",
      `repos/raycast/extensions/git/trees/${rootSha.trim()}`,
      "--jq",
      '.tree[] | select(.type == "tree") | @json',
    ]);
    return stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { path: string; type: string })
      .map((entry) => ({ name: entry.path, type: entry.type }));
  } catch {
    // Fall through for machines that do not have GitHub CLI installed.
  }
  const entries: CatalogEntry[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const response = await fetch(`${catalogUrl}?per_page=100&page=${page}`, {
      headers: { accept: "application/vnd.github+json", "user-agent": "blast-tmux" },
    });
    if (!response.ok) throw new Error(`Raycast catalog returned HTTP ${response.status}`);
    const pageEntries = (await response.json()) as CatalogEntry[];
    entries.push(...pageEntries.filter((entry) => entry.type === "dir"));
    if (pageEntries.length < 100) break;
  }
  return entries;
}

async function install(entry: CatalogEntry): Promise<void> {
  const destination = join(dataRoot(), entry.name);
  await mkdir(dataRoot(), { recursive: true });
  await rm(destination, { recursive: true, force: true });
  const temporary = `${destination}.download-${process.pid}`;
  await rm(temporary, { recursive: true, force: true });
  await run("git", [
    "clone",
    "--depth",
    "1",
    "--filter=blob:none",
    "--sparse",
    "https://github.com/raycast/extensions.git",
    temporary,
  ]);
  await run("git", ["-C", temporary, "sparse-checkout", "set", `extensions/${entry.name}`]);
  await run("mv", [join(temporary, "extensions", entry.name), destination]);
  await rm(temporary, { recursive: true, force: true });
  const manifest = JSON.parse(await readFile(join(destination, "package.json"), "utf8")) as {
    title?: string;
    name?: string;
  };
  const config = await loadConfig();
  const item: InstalledExtension = {
    id: entry.name,
    title: manifest.title ?? manifest.name ?? entry.name,
    directory: destination,
    enabled: true,
  };
  config.extensions = [...config.extensions.filter((candidate) => candidate.id !== item.id), item];
  await saveConfig(config);
}

export default function InstallExtension() {
  const [entries, setEntries] = useState<CatalogEntry[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    catalog().then(setEntries, (reason: unknown) => setError(String(reason)));
  }, []);
  return (
    <List isLoading={!entries && !error} searchBarPlaceholder="Search official Raycast extensions">
      {error ? <List.EmptyView title="Could not load catalog" description={error} /> : null}
      {entries?.map((entry) => (
        <List.Item
          key={entry.name}
          title={entry.name}
          icon={Icon.Download}
          actions={
            <ActionPanel>
              <Action
                title="Install Extension"
                icon={Icon.Download}
                onAction={async () => {
                  await showToast({
                    style: Toast.Style.Animated,
                    title: `Installing ${entry.name}`,
                  });
                  try {
                    await install(entry);
                    await showToast({
                      style: Toast.Style.Success,
                      title: `Installed ${entry.name}`,
                    });
                  } catch (reason) {
                    await showToast({
                      style: Toast.Style.Failure,
                      title: "Install failed",
                      message: String(reason),
                    });
                  }
                }}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
