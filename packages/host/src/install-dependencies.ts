import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { defaultDataDir } from "./storage.ts";

export type DependencyInstallOptions = { extensionDir: string; dataDir?: string };
export type DependencyInstallStatus = {
  directory: string;
  key: string;
  needed: boolean;
  pinned: boolean;
};
export type DependencyInstaller = (request: {
  command: string;
  args: string[];
  cwd: string;
  onLog?: (message: string) => void;
}) => Promise<void>;

export const npmDependencyInstaller: DependencyInstaller = ({ command, args, cwd, onLog }) =>
  new Promise((done, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => onLog?.(chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => onLog?.(chunk.toString()));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) done();
      else reject(new Error(`npm install failed (${signal ?? code})`));
    });
  });

function supplied(name: string): boolean {
  return name === "@raycast/api" || /^react(?:\/|$)/.test(name) || name.startsWith("@types/");
}

async function optionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function inputs(options: DependencyInstallOptions) {
  const extensionDir = resolve(options.extensionDir);
  const manifest = JSON.parse(await readFile(join(extensionDir, "package.json"), "utf8"));
  if (typeof manifest.name !== "string" || !manifest.name)
    throw new Error("An extension name is required for dependency installation");
  const lock = await optionalFile(join(extensionDir, "package-lock.json"));
  // Sort dependency fields so JSON property order does not invalidate an install.
  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies ?? {}).toSorted(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    ),
  );
  const key = createHash("sha256")
    .update(JSON.stringify(dependencies))
    .update("\n")
    .update(lock ?? "")
    .digest("hex");
  const encoded = encodeURIComponent(manifest.name).replace(/\./g, "%2E");
  const directory = resolve(options.dataDir ?? defaultDataDir(), "deps", encoded);
  return { manifest, dependencies, extensionDir, lock, key, directory };
}

/** Cheap disk-only check; a key is published only after a successful install. */
export async function checkExtensionDependencies(
  options: DependencyInstallOptions,
): Promise<DependencyInstallStatus> {
  const { directory, key, lock } = await inputs(options);
  return {
    directory,
    key,
    needed: (await optionalFile(join(directory, "key"))) !== key,
    pinned: lock !== undefined,
  };
}

/** Installs only production dependencies; never writes to the extension. */
export async function installExtensionDependencies(
  options: DependencyInstallOptions & {
    installer?: DependencyInstaller;
    onLog?: (message: string) => void;
  },
): Promise<DependencyInstallStatus> {
  const input = await inputs(options);
  const status = {
    directory: input.directory,
    key: input.key,
    needed: false,
    pinned: input.lock !== undefined,
  };
  if ((await optionalFile(join(input.directory, "key"))) === input.key) {
    options.onLog?.("Dependencies are up to date.");
    return status;
  }
  if (!status.pinned)
    options.onLog?.("Warning: no package-lock.json; dependency versions are unpinned.");
  const dependencies = Object.fromEntries(
    Object.entries(input.dependencies)
      .filter(([name]) => !supplied(name))
      .map(([name, value]) => {
        if (typeof value !== "string") throw new Error(`Invalid dependency ${name}`);
        // Local packages retain their source location after the manifest is copied.
        return [
          name,
          value.startsWith("file:") ? `file:${resolve(input.extensionDir, value.slice(5))}` : value,
        ];
      }),
  );
  await rm(input.directory, { recursive: true, force: true });
  await mkdir(input.directory, { recursive: true });
  try {
    await writeFile(
      join(input.directory, "package.json"),
      JSON.stringify(
        {
          name: input.manifest.name,
          version: input.manifest.version ?? "0.0.0",
          private: true,
          dependencies,
        },
        null,
        2,
      ),
    );
    if (input.lock !== undefined) {
      const lock = JSON.parse(input.lock);
      // Keep pinned package entries, but align the root with the filtered manifest.
      if (lock.packages?.[""]) {
        lock.packages[""] = {
          name: input.manifest.name,
          version: input.manifest.version ?? "0.0.0",
          dependencies,
        };
      }
      if (lock.dependencies) {
        for (const name of Object.keys(lock.dependencies)) {
          if (supplied(name)) delete lock.dependencies[name];
        }
      }
      await writeFile(join(input.directory, "package-lock.json"), JSON.stringify(lock, null, 2));
    }
    if (Object.keys(dependencies).length)
      await (options.installer ?? npmDependencyInstaller)({
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["install", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund"],
        cwd: input.directory,
        ...(options.onLog ? { onLog: options.onLog } : {}),
      });
    await writeFile(join(input.directory, "key"), input.key);
    return status;
  } catch (error) {
    await rm(input.directory, { recursive: true, force: true });
    throw error;
  }
}
