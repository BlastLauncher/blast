import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";

import { ensureExtensionDependencies } from "@blastlauncher/extension-deps";
import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import type { ExtensionProcess, ExtensionProcessExit, ExtensionProcessLauncher } from "@blastlauncher/extension-host";
import { createJsonLineTransport } from "@blastlauncher/transport-node";

export interface NodeExtensionProcessLauncherDependencyOptions {
  /** Absolute store root owning one isolated view per extension identity. */
  readonly storeRoot: string;
  readonly npmExecutable?: string;
  readonly offline?: boolean;
  readonly maxInstallBytes?: number;
  readonly maxCacheBytes?: number;
  readonly installTimeoutMilliseconds?: number;
}

export interface NodeExtensionProcessLauncherOptions {
  readonly bootstrapPath: string;
  readonly environment: NodeJS.ProcessEnv | ((descriptor: ExtensionDescriptor) => NodeJS.ProcessEnv);
  readonly nodeExecutable?: string;
  readonly execArguments?: readonly string[];
  readonly gracefulShutdownMilliseconds?: number;
  readonly maxFrameBytes?: number;
  readonly onStderr?: (descriptor: ExtensionDescriptor, chunk: string) => void;
  /**
   * When set, the launcher provisions the extension manifest dependencies
   * into an isolated view before spawning and exposes the view to the
   * bootstrap through `BLAST_V2_VENDOR_ROOTS`. Install failures abort the
   * launch with a structured dependency diagnostic.
   */
  readonly dependencies?: NodeExtensionProcessLauncherDependencyOptions;
}

export class NodeExtensionProcessLauncher implements ExtensionProcessLauncher {
  readonly #options: NodeExtensionProcessLauncherOptions;

  constructor(options: NodeExtensionProcessLauncherOptions) {
    if (!isAbsolute(options.bootstrapPath)) {
      throw new Error("bootstrapPath must be absolute");
    }
    if (
      options.gracefulShutdownMilliseconds !== undefined &&
      (!Number.isSafeInteger(options.gracefulShutdownMilliseconds) || options.gracefulShutdownMilliseconds < 0)
    ) {
      throw new Error("gracefulShutdownMilliseconds must be a non-negative safe integer");
    }
    this.#options = options;
  }

  async launch(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<ExtensionProcess> {
    if (signal?.aborted) {
      throw abortError(signal.reason);
    }

    const provisionedVendorRoots = await this.#provisionDependencies(descriptor, signal);

    const child = spawn(
      this.#options.nodeExecutable ?? process.execPath,
      [...(this.#options.execArguments ?? []), this.#options.bootstrapPath],
      {
        cwd: descriptor.rootDirectory,
        env: withVendorRoots(resolveEnvironment(this.#options.environment, descriptor), provisionedVendorRoots),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const completion = processCompletion(child);
    const connection = createJsonLineTransport({
      readable: child.stdout,
      writable: child.stdin,
      ...(this.#options.maxFrameBytes === undefined ? {} : { maxFrameBytes: this.#options.maxFrameBytes }),
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      this.#options.onStderr?.(descriptor, chunk);
    });

    const extensionProcess = new NodeExtensionProcess(
      child,
      connection,
      completion,
      this.#options.gracefulShutdownMilliseconds ?? 500,
    );

    try {
      await waitForSpawn(child, signal);
    } catch (error) {
      await extensionProcess.stop("Process launch failed");
      throw error;
    }

    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          void extensionProcess.stop(reasonText(signal.reason));
        },
        { once: true },
      );
    }
    return extensionProcess;
  }

  async #provisionDependencies(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<readonly string[]> {
    const dependencies = this.#options.dependencies;
    if (dependencies === undefined) {
      return [];
    }
    const view = await ensureExtensionDependencies({
      extensionRoot: resolve(descriptor.rootDirectory),
      extensionId: descriptor.extensionId,
      storeRoot: dependencies.storeRoot,
      ...(dependencies.npmExecutable === undefined ? {} : { npmExecutable: dependencies.npmExecutable }),
      ...(dependencies.offline === undefined ? {} : { offline: dependencies.offline }),
      ...(dependencies.maxInstallBytes === undefined ? {} : { maxInstallBytes: dependencies.maxInstallBytes }),
      ...(dependencies.maxCacheBytes === undefined ? {} : { maxCacheBytes: dependencies.maxCacheBytes }),
      ...(dependencies.installTimeoutMilliseconds === undefined
        ? {}
        : { installTimeoutMilliseconds: dependencies.installTimeoutMilliseconds }),
      ...(signal === undefined ? {} : { signal }),
    });
    // A view without installed packages may not exist on disk; esbuild only
    // receives roots that actually resolve.
    return existsSync(view.nodeModulesRoot) ? [view.nodeModulesRoot] : [];
  }
}

class NodeExtensionProcess implements ExtensionProcess {
  readonly connection;
  readonly completion: Promise<ExtensionProcessExit>;
  readonly processId?: number;
  readonly #child: ChildProcessWithoutNullStreams;
  readonly #gracefulShutdownMilliseconds: number;
  #stopPromise?: Promise<void>;

  constructor(
    child: ChildProcessWithoutNullStreams,
    connection: ReturnType<typeof createJsonLineTransport>,
    completion: Promise<ExtensionProcessExit>,
    gracefulShutdownMilliseconds: number,
  ) {
    this.#child = child;
    this.connection = connection;
    this.completion = completion;
    if (child.pid !== undefined) {
      this.processId = child.pid;
    }
    this.#gracefulShutdownMilliseconds = gracefulShutdownMilliseconds;
  }

  stop(reason?: string): Promise<void> {
    this.#stopPromise ??= this.#stop(reason);
    return this.#stopPromise;
  }

  async #stop(reason?: string): Promise<void> {
    await closeBestEffort(this.connection, reason);
    if (await completesWithin(this.completion, this.#gracefulShutdownMilliseconds)) {
      return;
    }

    this.#child.kill("SIGTERM");
    if (await completesWithin(this.completion, this.#gracefulShutdownMilliseconds)) {
      return;
    }

    this.#child.kill("SIGKILL");
    await this.completion;
  }
}

function resolveEnvironment(
  environment: NodeExtensionProcessLauncherOptions["environment"],
  descriptor: ExtensionDescriptor,
): NodeJS.ProcessEnv {
  return typeof environment === "function" ? environment(descriptor) : environment;
}

function withVendorRoots(environment: NodeJS.ProcessEnv, provisioned: readonly string[]): NodeJS.ProcessEnv {
  if (provisioned.length === 0) {
    return environment;
  }
  const existing = environment.BLAST_V2_VENDOR_ROOTS;
  const roots = [...provisioned, ...(existing === undefined || existing.length === 0 ? [] : [existing])];
  return { ...environment, BLAST_V2_VENDOR_ROOTS: roots.join(delimiter) };
}

function processCompletion(child: ChildProcessWithoutNullStreams): Promise<ExtensionProcessExit> {
  return new Promise((resolve) => {
    let settled = false;
    const complete = (exit: ExtensionProcessExit): void => {
      if (!settled) {
        settled = true;
        resolve(exit);
      }
    };
    child.once("error", (error) => complete({ code: null, error }));
    child.once("exit", (code, signal) => complete({ code, ...(signal === null ? {} : { signal }) }));
  });
}

async function waitForSpawn(child: ChildProcessWithoutNullStreams, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const cleanup = (): void => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onSpawn = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      cleanup();
      reject(abortError(signal?.reason));
    };

    child.once("spawn", onSpawn);
    child.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function completesWithin(completion: Promise<unknown>, milliseconds: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  const elapsed = new Promise<false>((resolve) => {
    timeout = setTimeout(resolve, milliseconds, false);
    timeout.unref();
  });
  const completed = await Promise.race([completion.then(() => true as const), elapsed]);
  if (timeout) {
    clearTimeout(timeout);
  }
  return completed;
}

async function closeBestEffort(connection: ExtensionProcess["connection"], reason?: string): Promise<void> {
  try {
    await connection.close(reason);
  } catch {
    // Process termination remains available when stream cleanup fails.
  }
}

function abortError(reason: unknown): Error {
  return new Error(`Extension process launch cancelled: ${reasonText(reason)}`, { cause: reason });
}

function reasonText(reason: unknown): string {
  return typeof reason === "string" ? reason : "cancelled";
}
