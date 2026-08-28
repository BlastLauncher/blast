import type { ExtensionDescriptor } from "@blastlauncher/extension-contract";
import type { ExtensionHostEvent, ExtensionSession } from "@blastlauncher/extension-host";

export interface CommandIdentity {
  readonly extensionId: string;
  readonly commandName: string;
}

export interface ExtensionCatalog {
  resolve(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionDescriptor | undefined>;
}

export interface ExtensionSupervisor {
  readonly events: AsyncIterable<ExtensionHostEvent>;
  readonly activeSessions: readonly ExtensionSession[];
  start(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<ExtensionSession>;
  stop(extensionId: string, commandName: string, reason?: string): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface BlastCoreOptions {
  readonly catalog: ExtensionCatalog;
  readonly extensionHost: ExtensionSupervisor;
}

export type BlastCoreState = "running" | "closing" | "closed";

export class BlastCoreError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "BlastCoreError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export class BlastCore {
  readonly extensionEvents: AsyncIterable<ExtensionHostEvent>;
  readonly #catalog: ExtensionCatalog;
  readonly #extensionHost: ExtensionSupervisor;
  readonly #inFlightStarts = new Set<Promise<ExtensionSession>>();
  #state: BlastCoreState = "running";
  #closePromise?: Promise<void>;

  constructor(options: BlastCoreOptions) {
    this.#catalog = options.catalog;
    this.#extensionHost = options.extensionHost;
    this.extensionEvents = options.extensionHost.events;
  }

  get state(): BlastCoreState {
    return this.#state;
  }

  get activeExtensions(): readonly ExtensionSession[] {
    return this.#extensionHost.activeSessions;
  }

  runCommand(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionSession> {
    this.#assertRunning();
    validateIdentity(identity);
    const operation = this.#runCommand(identity, signal);
    this.#inFlightStarts.add(operation);
    void operation.then(
      () => this.#inFlightStarts.delete(operation),
      () => this.#inFlightStarts.delete(operation),
    );
    return operation;
  }

  async stopCommand(identity: CommandIdentity, reason?: string): Promise<void> {
    this.#assertRunning();
    validateIdentity(identity);
    await this.#extensionHost.stop(identity.extensionId, identity.commandName, reason);
  }

  close(reason?: string): Promise<void> {
    this.#closePromise ??= this.#close(reason);
    return this.#closePromise;
  }

  async #runCommand(identity: CommandIdentity, signal?: AbortSignal): Promise<ExtensionSession> {
    const descriptor = await this.#catalog.resolve(identity, signal);
    if (descriptor === undefined) {
      throw new BlastCoreError("command_not_found", "Extension command was not found", identity);
    }
    if (descriptor.extensionId !== identity.extensionId || descriptor.commandName !== identity.commandName) {
      throw new BlastCoreError("catalog_identity_mismatch", "Catalog resolved a different extension command", {
        requested: identity,
        resolved: descriptor,
      });
    }

    this.#assertRunning();
    return this.#extensionHost.start(descriptor, signal);
  }

  async #close(reason?: string): Promise<void> {
    if (this.#state === "closed") {
      return;
    }
    this.#state = "closing";
    try {
      await Promise.allSettled([...this.#inFlightStarts]);
      await this.#extensionHost.close(reason);
    } finally {
      this.#state = "closed";
    }
  }

  #assertRunning(): void {
    if (this.#state !== "running") {
      throw new BlastCoreError("core_not_running", `Blast core is ${this.#state}`);
    }
  }
}

function validateIdentity(identity: CommandIdentity): void {
  if (
    typeof identity.extensionId !== "string" ||
    identity.extensionId.length === 0 ||
    typeof identity.commandName !== "string" ||
    identity.commandName.length === 0
  ) {
    throw new BlastCoreError("invalid_command_identity", "Extension and command identifiers must not be empty");
  }
}
