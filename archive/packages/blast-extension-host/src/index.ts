import {
  EXTENSION_INITIALIZE_MESSAGE,
  extensionIdentityMatches,
  validateExtensionReadyMessage,
  type ExtensionDescriptor,
} from "@blastlauncher/extension-contract";
import type { PeerImplementation } from "@blastlauncher/protocol";
import { acceptProtocolSession, ProtocolSession, ProtocolSessionError } from "@blastlauncher/session";
import type { ProtocolTransport } from "@blastlauncher/transport";

export type { ExtensionDescriptor } from "@blastlauncher/extension-contract";

export interface ExtensionProcessExit {
  readonly code: number | null;
  readonly signal?: string;
  readonly error?: unknown;
}

export interface ExtensionProcess {
  readonly connection: ProtocolTransport;
  readonly completion: Promise<ExtensionProcessExit>;
  readonly processId?: number;
  stop(reason?: string): Promise<void>;
}

export interface ExtensionProcessLauncher {
  launch(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<ExtensionProcess>;
}

export interface ExtensionSession {
  readonly descriptor: ExtensionDescriptor;
  readonly process: ExtensionProcess;
  readonly protocol: ProtocolSession;
}

export type ExtensionHostEvent =
  | { readonly type: "extension.starting"; readonly descriptor: ExtensionDescriptor }
  | { readonly type: "extension.started"; readonly session: ExtensionSession }
  | { readonly type: "extension.start-failed"; readonly descriptor: ExtensionDescriptor; readonly error: unknown }
  | { readonly type: "extension.stopping"; readonly session: ExtensionSession; readonly reason?: string }
  | { readonly type: "extension.stopped"; readonly descriptor: ExtensionDescriptor; readonly reason?: string }
  | {
      readonly type: "extension.process-exited";
      readonly descriptor: ExtensionDescriptor;
      readonly exit: ExtensionProcessExit;
    };

export interface ExtensionHostOptions {
  readonly launcher: ExtensionProcessLauncher;
  readonly implementation: PeerImplementation;
  readonly createMessageId: () => string;
  readonly createSessionId: () => string;
  readonly protocolVersions?: readonly number[];
}

export class ExtensionHost {
  readonly events: AsyncIterable<ExtensionHostEvent>;
  readonly #options: ExtensionHostOptions;
  readonly #eventQueue = new EventQueue<ExtensionHostEvent>();
  readonly #sessions = new Map<string, ExtensionSession>();
  readonly #startingSessions = new Set<string>();
  #closed = false;

  constructor(options: ExtensionHostOptions) {
    this.#options = options;
    this.events = this.#eventQueue;
  }

  get activeSessions(): readonly ExtensionSession[] {
    return [...this.#sessions.values()];
  }

  async start(descriptor: ExtensionDescriptor, signal?: AbortSignal): Promise<ExtensionSession> {
    if (this.#closed) {
      throw new Error("Extension host is closed");
    }

    const sessionKey = getSessionKey(descriptor);
    if (this.#sessions.has(sessionKey) || this.#startingSessions.has(sessionKey)) {
      throw new Error(`Extension session already exists: ${sessionKey}`);
    }

    this.#startingSessions.add(sessionKey);
    this.#emit({ type: "extension.starting", descriptor });
    let process: ExtensionProcess | undefined;
    let protocol: ProtocolSession | undefined;
    let processExited = false;

    try {
      process = await this.#options.launcher.launch(descriptor, signal);
      const launchedProcess = process;
      void launchedProcess.completion.then((exit) => {
        processExited = true;
        const active = this.#sessions.get(sessionKey);
        if (active?.process === launchedProcess) {
          this.#sessions.delete(sessionKey);
        }
        this.#emit({ type: "extension.process-exited", descriptor, exit });
      });

      protocol = await acceptProtocolSession(process.connection, {
        role: "extension-host",
        implementation: this.#options.implementation,
        createMessageId: this.#options.createMessageId,
        createSessionId: this.#options.createSessionId,
        ...(this.#options.protocolVersions === undefined ? {} : { protocolVersions: this.#options.protocolVersions }),
        ...(signal === undefined ? {} : { signal }),
      });
      if (protocol.remotePeer.role !== "extension-runtime") {
        throw new ProtocolSessionError(
          "unexpected_peer_role",
          `Expected extension-runtime, received ${protocol.remotePeer.role}`,
        );
      }

      await protocol.send(EXTENSION_INITIALIZE_MESSAGE, { descriptor });
      const response = await protocol.receive(signal);
      if (response === undefined || response.type === "shutdown") {
        throw new ProtocolSessionError(
          "runtime_closed_during_initialization",
          "Extension runtime closed before reporting readiness",
        );
      }

      const ready = validateExtensionReadyMessage(response);
      if (!ready.ok) {
        throw new ProtocolSessionError(
          "invalid_extension_readiness",
          "Extension runtime sent an invalid readiness message",
          ready.issues,
        );
      }
      if (!extensionIdentityMatches(descriptor, ready.value.payload)) {
        throw new ProtocolSessionError(
          "extension_identity_mismatch",
          "Extension runtime reported readiness for another command",
          { expected: descriptor, received: ready.value.payload },
        );
      }
      if (processExited) {
        throw new ProtocolSessionError(
          "runtime_exited_during_initialization",
          "Extension runtime exited during startup",
        );
      }

      const session = { descriptor, process, protocol };
      this.#sessions.set(sessionKey, session);
      this.#emit({ type: "extension.started", session });
      return session;
    } catch (error) {
      await closeSessionBestEffort(protocol, "Extension startup failed");
      await stopProcessBestEffort(process, "Extension startup failed");
      this.#emit({ type: "extension.start-failed", descriptor, error });
      throw error;
    } finally {
      this.#startingSessions.delete(sessionKey);
    }
  }

  async stop(extensionId: string, commandName: string, reason?: string): Promise<void> {
    const sessionKey = getSessionKey({ extensionId, commandName });
    const session = this.#sessions.get(sessionKey);
    if (!session) {
      return;
    }

    this.#sessions.delete(sessionKey);
    this.#emit({ type: "extension.stopping", session, ...(reason === undefined ? {} : { reason }) });
    const failures: unknown[] = [];
    try {
      await session.protocol.close(reason);
    } catch (error) {
      failures.push(error);
    }
    try {
      await session.process.stop(reason);
    } catch (error) {
      failures.push(error);
    }
    this.#emit({
      type: "extension.stopped",
      descriptor: session.descriptor,
      ...(reason === undefined ? {} : { reason }),
    });

    if (failures.length > 0) {
      throw new AggregateError(failures, `Failed to stop extension session: ${sessionKey}`);
    }
  }

  async stopAll(reason?: string): Promise<void> {
    const identities = [...this.#sessions.values()].map(
      ({ descriptor }) => [descriptor.extensionId, descriptor.commandName] as const,
    );
    const results = await Promise.allSettled(
      identities.map(([extensionId, commandName]) => this.stop(extensionId, commandName, reason)),
    );
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
    if (failures.length > 0) {
      throw new AggregateError(
        failures.map((failure) => failure.reason),
        "Failed to stop all extension sessions",
      );
    }
  }

  async close(reason?: string): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    try {
      await this.stopAll(reason);
    } finally {
      this.#eventQueue.close();
    }
  }

  #emit(event: ExtensionHostEvent): void {
    this.#eventQueue.enqueue(event);
  }
}

function getSessionKey(descriptor: Pick<ExtensionDescriptor, "extensionId" | "commandName">): string {
  return JSON.stringify([descriptor.extensionId, descriptor.commandName]);
}

async function closeSessionBestEffort(session: ProtocolSession | undefined, reason: string): Promise<void> {
  try {
    await session?.close(reason);
  } catch {
    // Preserve the startup error.
  }
}

async function stopProcessBestEffort(process: ExtensionProcess | undefined, reason: string): Promise<void> {
  try {
    await process?.stop(reason);
  } catch {
    // Preserve the startup error.
  }
}

class EventQueue<T> implements AsyncIterableIterator<T> {
  readonly #values: T[] = [];
  readonly #waiters: Array<(result: IteratorResult<T>) => void> = [];
  #closed = false;

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }

  next(): Promise<IteratorResult<T>> {
    const value = this.#values.shift();
    if (value !== undefined) {
      return Promise.resolve({ done: false, value });
    }
    if (this.#closed) {
      return Promise.resolve({ done: true, value: undefined });
    }
    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }

  enqueue(value: T): void {
    if (this.#closed) {
      return;
    }
    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ done: false, value });
      return;
    }
    this.#values.push(value);
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    for (const waiter of this.#waiters.splice(0)) {
      waiter({ done: true, value: undefined });
    }
  }
}
