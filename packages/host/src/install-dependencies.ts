import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { loadSharedDependencies, type SharedDependencyLoader } from "./dependencies.ts";
import { requiredPeerAdditions, supplied } from "./install-peers.ts";
import { defaultDataDir } from "./storage.ts";

export type DependencyInstallOptions = {
  extensionDir: string;
  dataDir?: string;
  sharedDependencies?: SharedDependencyLoader;
};
export type DependencyInstallStatus = {
  directory: string;
  key: string;
  needed: boolean;
  pinned: boolean;
  /** Declared packages unavailable from a matching install or shared fallback. */
  unresolved: string[];
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

type LockedDependency = { dependencies?: Record<string, LockedDependency> };

function stripSuppliedDependencies(dependencies: Record<string, LockedDependency>): void {
  for (const [name, dependency] of Object.entries(dependencies)) {
    if (supplied(name)) delete dependencies[name];
    else if (dependency.dependencies) stripSuppliedDependencies(dependency.dependencies);
  }
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
  const baseKey = createHash("sha256")
    // Rebuild installs made before required peers were repaired.
    .update("lean-install-v2\n")
    .update(JSON.stringify(dependencies))
    .update("\n")
    .update(lock ?? "")
    .digest("hex");
  const encoded = encodeURIComponent(manifest.name).replace(/\./g, "%2E");
  const directory = resolve(options.dataDir ?? defaultDataDir(), "deps", encoded);
  const additions = JSON.parse(
    (await optionalFile(join(directory, "peer-additions.json"))) ?? "{}",
  );
  const key = installKey(baseKey, additions);
  return { manifest, dependencies, extensionDir, lock, key, baseKey, directory };
}

function installKey(baseKey: string, additions: Record<string, string>): string {
  return createHash("sha256")
    .update(baseKey)
    .update(JSON.stringify(Object.entries(additions).toSorted(([a], [b]) => a.localeCompare(b))))
    .digest("hex");
}

/** Cheap disk-only check; a key is published only after a successful install. */
export async function checkExtensionDependencies(
  options: DependencyInstallOptions,
): Promise<DependencyInstallStatus> {
  const { directory, key, lock, dependencies } = await inputs(options);
  const needed = (await optionalFile(join(directory, "key"))) !== key;
  const shared = await loadSharedDependencies(options.sharedDependencies);
  const unresolved: string[] = [];
  for (const name of Object.keys(dependencies)) {
    if (supplied(name)) continue;
    if (
      !needed &&
      (await optionalFile(join(directory, "node_modules", name, "package.json"))) !== undefined
    )
      continue;
    if (shared?.resolveShared(name)) continue;
    unresolved.push(name);
  }
  return {
    directory,
    key,
    needed,
    unresolved,
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
    unresolved: [],
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
      if (lock.packages) {
        for (const path of Object.keys(lock.packages)) {
          // Drop supplied packages and their private graphs at any nesting depth.
          if (
            path
              .split(/(?:^|\/)node_modules\//)
              .slice(1)
              .some(supplied)
          )
            delete lock.packages[path];
        }
      }
      if (lock.dependencies) stripSuppliedDependencies(lock.dependencies);
      await writeFile(join(input.directory, "package-lock.json"), JSON.stringify(lock, null, 2));
    }
    const install = () =>
      (options.installer ?? npmDependencyInstaller)({
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: [
          "install",
          "--omit=dev",
          "--omit=peer",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
        ],
        cwd: input.directory,
        ...(options.onLog ? { onLog: options.onLog } : {}),
      });
    if (Object.keys(dependencies).length) await install();
    const additions: Record<string, string> = {};
    for (let pass = 0; pass < 2; pass++) {
      const peers = await requiredPeerAdditions(input.directory, input.lock, options.onLog);
      let changed = false;
      for (const [name, range] of Object.entries(peers)) {
        if (name in input.dependencies || additions[name] === range) {
          options.onLog?.(`Warning: unresolved required peer ${name} (${range}).`);
          continue;
        }
        dependencies[name] = additions[name] = range;
        changed = true;
      }
      if (!changed) break;
      const path = join(input.directory, "package.json");
      const manifest = JSON.parse(await readFile(path, "utf8"));
      await writeFile(path, JSON.stringify({ ...manifest, dependencies }, null, 2));
      try {
        await install();
      } catch (error) {
        options.onLog?.(`Warning: required peer installation failed: ${String(error)}`);
        break;
      }
    }
    for (const [name, range] of Object.entries(
      await requiredPeerAdditions(input.directory, input.lock),
    ))
      options.onLog?.(`Warning: unresolved required peer ${name} (${range}).`);
    status.key = installKey(input.baseKey, additions);
    await writeFile(join(input.directory, "peer-additions.json"), JSON.stringify(additions));
    await writeFile(join(input.directory, "key"), status.key);
    return status;
  } catch (error) {
    await rm(input.directory, { recursive: true, force: true });
    throw error;
  }
}
