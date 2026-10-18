import type { CommandMode } from "@blastlauncher/protocol";
import { build } from "esbuild";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export type BundleOptions = { extensionDir: string; command: string; outDir?: string };
export type BundledCommand = {
  entry: string;
  extensionName: string;
  commandName: string;
  mode: CommandMode;
};

/** The caller owns the output directory and may remove it once the session exits. */
export async function bundleCommand(options: BundleOptions): Promise<BundledCommand> {
  const extensionDir = resolve(options.extensionDir);
  const manifest = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
  const command = manifest.commands?.find(
    (item: { name: string }) => item.name === options.command,
  );
  if (typeof manifest.name !== "string" || !command) throw new Error("Unknown extension command");
  if (!/^[\w-]+$/.test(options.command)) throw new Error("Invalid command name");
  if (!["view", "no-view", "menu-bar"].includes(command.mode))
    throw new Error("Invalid command mode");
  let source: string | undefined;
  for (const suffix of ["tsx", "ts", "jsx", "js"]) {
    const candidate = join(extensionDir, "src", `${options.command}.${suffix}`);
    try {
      await access(candidate);
      source = candidate;
      break;
    } catch {
      // Try the next supported source extension.
    }
  }
  if (!source) throw new Error(`Missing source for ${options.command}`);
  const base = join(tmpdir(), "blast", "builds");
  if (!options.outDir) await mkdir(base, { recursive: true });
  const outDir = options.outDir ? resolve(options.outDir) : await mkdtemp(join(base, "command-"));
  const entry = join(outDir, `${options.command}.mjs`);
  try {
    await build({
      absWorkingDir: extensionDir,
      entryPoints: [source],
      outfile: entry,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node24",
      jsx: "automatic",
      external: ["@raycast/api", "react", "react/*"],
      logLevel: "silent",
    });
  } catch (error) {
    if (!options.outDir) await rm(outDir, { recursive: true, force: true });
    throw error;
  }
  return { entry, extensionName: manifest.name, commandName: command.name, mode: command.mode };
}
