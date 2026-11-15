import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type InstalledExtension = {
  id: string;
  title: string;
  directory: string;
  enabled: boolean;
};

export type BlastConfig = {
  builtinTmux: boolean;
  extensions: InstalledExtension[];
};

const defaultConfig: BlastConfig = { builtinTmux: true, extensions: [] };

export function configPath(): string {
  if (process.env.BLAST_TMUX_CONFIG) return process.env.BLAST_TMUX_CONFIG;
  const home = process.env.HOME ?? process.cwd();
  const base = process.env.XDG_CONFIG_HOME ?? join(home, ".config");
  return join(base, "blast", "tmux.json");
}

export async function loadConfig(): Promise<BlastConfig> {
  try {
    const parsed = JSON.parse(await readFile(configPath(), "utf8")) as Partial<BlastConfig>;
    return {
      builtinTmux: parsed.builtinTmux !== false,
      extensions: Array.isArray(parsed.extensions)
        ? parsed.extensions.filter(
            (item): item is InstalledExtension =>
              !!item &&
              typeof item === "object" &&
              typeof item.id === "string" &&
              typeof item.directory === "string" &&
              typeof item.title === "string" &&
              typeof item.enabled === "boolean",
          )
        : [],
    };
  } catch {
    return { ...defaultConfig, extensions: [] };
  }
}

export async function saveConfig(config: BlastConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}`;
  await writeFile(temp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, path);
}
