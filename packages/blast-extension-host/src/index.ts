import type { ProtocolEnvelope } from "@blastlauncher/protocol";

export interface ExtensionDescriptor {
  readonly extensionId: string;
  readonly commandName: string;
  readonly entrypoint: string;
  readonly rootDirectory: string;
}

export interface ProtocolConnection {
  readonly messages: AsyncIterable<ProtocolEnvelope>;
  send(message: ProtocolEnvelope): Promise<void>;
  close(reason?: string): Promise<void>;
}

export interface ExtensionProcess {
  readonly connection: ProtocolConnection;
  readonly processId?: number;
  stop(reason?: string): Promise<void>;
}

export interface ExtensionProcessLauncher {
  launch(descriptor: ExtensionDescriptor, signal: AbortSignal): Promise<ExtensionProcess>;
}

export interface ExtensionSession {
  readonly descriptor: ExtensionDescriptor;
  readonly process: ExtensionProcess;
}

export class ExtensionHost {
  readonly #launcher: ExtensionProcessLauncher;
  readonly #sessions = new Map<string, ExtensionSession>();
  readonly #startingSessions = new Set<string>();

  constructor(launcher: ExtensionProcessLauncher) {
    this.#launcher = launcher;
  }

  get activeSessions(): readonly ExtensionSession[] {
    return [...this.#sessions.values()];
  }

  async start(descriptor: ExtensionDescriptor, signal: AbortSignal): Promise<ExtensionSession> {
    const sessionKey = getSessionKey(descriptor);
    if (this.#sessions.has(sessionKey) || this.#startingSessions.has(sessionKey)) {
      throw new Error(`Extension session already exists: ${sessionKey}`);
    }

    this.#startingSessions.add(sessionKey);
    try {
      const process = await this.#launcher.launch(descriptor, signal);
      const session = { descriptor, process };
      this.#sessions.set(sessionKey, session);
      return session;
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
    await session.process.stop(reason);
  }

  async stopAll(reason?: string): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(sessions.map((session) => session.process.stop(reason)));
  }
}

function getSessionKey(descriptor: Pick<ExtensionDescriptor, "extensionId" | "commandName">): string {
  return JSON.stringify([descriptor.extensionId, descriptor.commandName]);
}
