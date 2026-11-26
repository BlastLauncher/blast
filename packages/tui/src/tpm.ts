import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

function hasTpm(pluginsDir: string): boolean {
  const tpmDir = join(pluginsDir, "tpm");
  return existsSync(join(tpmDir, "bin", "install_plugins")) || existsSync(join(tpmDir, "tpm"));
}

/**
 * Returns the TPM plugins directory when Tmux Plugin Manager is installed in
 * any standard location (or explicitly via `BLAST_TPM_PATH` /
 * `TMUX_PLUGIN_MANAGER_PATH`), otherwise `undefined`.
 */
export function detectTpmPluginsDir(
  env: NodeJS.ProcessEnv = process.env,
  home: string = homedir(),
): string | undefined {
  const candidates = [
    env.BLAST_TPM_PATH,
    env.TMUX_PLUGIN_MANAGER_PATH,
    join(env.XDG_CONFIG_HOME ?? join(home, ".config"), "tmux", "plugins"),
    join(home, ".tmux", "plugins"),
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const dir = resolve(candidate);
    if (hasTpm(dir)) return dir;
  }
  return undefined;
}
