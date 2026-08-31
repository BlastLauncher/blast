import {
  CoreClientError,
  type CommandIdentity,
  type CoreClient,
  type CoreClientMessage,
  type CoreCommandDescriptor,
} from "@blastlauncher/core";
import { SceneStateBuffer, type SceneFormValues, type SceneNode, type ToastPayload } from "@blastlauncher/scene";

export type CoreClientControllerState =
  | "created"
  | "loading-commands"
  | "ready"
  | "starting"
  | "running"
  | "stopping"
  | "closing"
  | "closed"
  | "failed";

export interface CoreClientFailure {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface CoreClientSnapshot {
  readonly state: CoreClientControllerState;
  readonly commands: readonly CoreCommandDescriptor[];
  readonly activeCommand?: CommandIdentity;
  readonly scene?: SceneNode;
  readonly error?: CoreClientFailure;
}

export interface CoreClientControllerOptions {
  readonly client: CoreClient;
  readonly onToast?: (toast: ToastPayload) => void;
}

export type CoreClientSnapshotListener = (snapshot: CoreClientSnapshot) => void;

export class CoreClientControllerError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "CoreClientControllerError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

/**
 * Owns the client-side receive pump and materialized state for one core
 * connection. The controller never receives filesystem-backed descriptors.
 */
export class CoreClientController {
  readonly #client: CoreClient;
  readonly #onToast: ((toast: ToastPayload) => void) | undefined;
  readonly #listeners = new Set<CoreClientSnapshotListener>();
  #state: CoreClientControllerState = "created";
  #commands: readonly CoreCommandDescriptor[] = [];
  #activeCommand: CommandIdentity | undefined;
  #scene = new SceneStateBuffer();
  #error: CoreClientFailure | undefined;
  #pumpPromise: Promise<void> | undefined;
  #startPromise: Promise<void> | undefined;
  #discoveryGate: PromiseGate<void> | undefined;
  #closePromise: Promise<void> | undefined;

  constructor(options: CoreClientControllerOptions) {
    this.#client = options.client;
    this.#onToast = options.onToast;
  }

  get state(): CoreClientControllerState {
    return this.#state;
  }

  get snapshot(): CoreClientSnapshot {
    const scene = this.#scene.toJSON();
    return {
      state: this.#state,
      commands: [...this.#commands],
      ...(this.#activeCommand === undefined ? {} : { activeCommand: { ...this.#activeCommand } }),
      ...(scene === undefined ? {} : { scene }),
      ...(this.#error === undefined ? {} : { error: { ...this.#error } }),
    };
  }

  /** Resolves when the receive pump ends, including after a client failure. */
  get done(): Promise<void> {
    return this.#pumpPromise ?? Promise.resolve();
  }

  subscribe(listener: CoreClientSnapshotListener): () => void {
    this.#listeners.add(listener);
    this.#notify(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /** Starts the receive pump and resolves after the first discovery response. */
  start(): Promise<void> {
    if (this.#startPromise !== undefined) {
      return this.#startPromise;
    }
    if (this.#state !== "created") {
      return Promise.reject(
        new CoreClientControllerError("controller_already_started", "The client controller has already started"),
      );
    }

    this.#startPromise = this.#start();
    return this.#startPromise;
  }

  /** Refreshes the discovery snapshot after a structured catalog failure. */
  refreshCommands(): Promise<void> {
    if (this.#state === "created") {
      return Promise.reject(
        new CoreClientControllerError("controller_not_started", "Start the client controller first"),
      );
    }
    if (this.#state === "closed" || this.#state === "closing") {
      return Promise.reject(new CoreClientControllerError("controller_closed", "The client controller is closed"));
    }
    if (this.#activeCommand !== undefined) {
      return Promise.reject(
        new CoreClientControllerError("command_active", "Cannot refresh commands while a command is active"),
      );
    }
    return this.#requestCommands();
  }

  async runCommand(identity: CommandIdentity): Promise<void> {
    this.#assertReady();
    if (this.#activeCommand !== undefined) {
      throw new CoreClientControllerError("command_active", "A command is already active");
    }

    this.#activeCommand = { ...identity };
    this.#scene = new SceneStateBuffer();
    this.#error = undefined;
    this.#setState("starting");
    try {
      await this.#client.runCommand(identity);
    } catch (error) {
      this.#activeCommand = undefined;
      this.#scene = new SceneStateBuffer();
      this.#error = toFailure(error, "command_start_failed", "Command failed to start");
      this.#setState("ready");
      throw toControllerError(error, "command_start_failed", "Command failed to start");
    }
  }

  async stopCommand(reason?: string): Promise<void> {
    this.#assertStarted();
    const active = this.#activeCommand;
    if (active === undefined) {
      return;
    }
    if (this.#state === "stopping") {
      return;
    }

    this.#setState("stopping");
    try {
      await this.#client.stopCommand(active, reason);
    } catch (error) {
      await this.#fail(error, "command_stop_failed", "Command failed to stop");
      throw toControllerError(error, "command_stop_failed", "Command failed to stop");
    }
  }

  async sendSceneEvent(eventId: string, values?: SceneFormValues): Promise<void> {
    this.#assertStarted();
    if (this.#activeCommand === undefined || this.#state !== "running") {
      throw new CoreClientControllerError("command_not_running", "No command is running on the client controller");
    }
    try {
      await this.#client.sendSceneEvent(eventId, values);
    } catch (error) {
      const controllerError = toControllerError(error, "scene_event_failed", "Scene event failed");
      if (controllerError.code === "invalid_scene_event") {
        throw controllerError;
      }
      await this.#fail(controllerError, "scene_event_failed", "Scene event failed");
      throw controllerError;
    }
  }

  close(reason?: string): Promise<void> {
    this.#closePromise ??= this.#close(reason);
    return this.#closePromise;
  }

  async #start(): Promise<void> {
    this.#pumpPromise = this.#pump();
    await this.#requestCommands();
  }

  async #requestCommands(): Promise<void> {
    if (this.#discoveryGate !== undefined) {
      throw new CoreClientControllerError("discovery_in_progress", "Command discovery is already in progress");
    }
    const gate = createPromiseGate<void>();
    this.#discoveryGate = gate;
    this.#setState("loading-commands");
    try {
      await this.#client.requestCommandList();
      await gate.promise;
    } catch (error) {
      if (error instanceof CoreClientControllerError && this.#state === "failed") {
        throw error;
      }
      const failure = await this.#fail(error, "command_discovery_failed", "Command discovery failed");
      throw failure;
    } finally {
      if (this.#discoveryGate === gate) {
        this.#discoveryGate = undefined;
      }
    }
  }

  async #pump(): Promise<void> {
    try {
      while (true) {
        const message = await this.#client.receive();
        if (message === undefined) {
          this.#finishClosed();
          return;
        }
        this.#handle(message);
      }
    } catch (error) {
      await this.#fail(error, "client_receive_failed", "The core client connection failed");
    }
  }

  #handle(message: CoreClientMessage): void {
    switch (message.type) {
      case "core.command.listed":
        this.#commands = message.payload.commands.map((command) => ({ ...command }));
        this.#error = undefined;
        this.#setState("ready");
        this.#discoveryGate?.resolve();
        return;
      case "core.command.list-failed": {
        const failure = { code: message.payload.code, message: message.payload.message };
        this.#error = failure;
        this.#setState("failed");
        this.#discoveryGate?.reject(new CoreClientControllerError(failure.code, failure.message));
        return;
      }
      case "core.command.started":
        if (sameIdentity(this.#activeCommand, message.payload)) {
          this.#error = undefined;
          this.#setState("running");
        }
        return;
      case "core.command.start-failed":
        if (sameIdentity(this.#activeCommand, message.payload)) {
          this.#activeCommand = undefined;
          this.#scene = new SceneStateBuffer();
          this.#error = {
            code: message.payload.code,
            message: message.payload.message,
          };
          this.#setState("ready");
        }
        return;
      case "core.command.stopped":
        if (sameIdentity(this.#activeCommand, message.payload)) {
          this.#clearCommand();
          this.#error = undefined;
          this.#setState("ready");
        }
        return;
      case "core.command.exited":
        if (sameIdentity(this.#activeCommand, message.payload)) {
          const details =
            message.payload.signal === undefined
              ? { code: message.payload.code }
              : { code: message.payload.code, signal: message.payload.signal };
          this.#clearCommand();
          this.#error = {
            code: "command_exited",
            message: "The active command exited unexpectedly",
            details,
          };
          this.#setState("ready");
        }
        return;
      case "scene.transaction":
        this.#scene.apply(message.payload);
        this.#emit();
        return;
      case "ui.toast":
        try {
          this.#onToast?.(message.payload);
        } catch {
          // UI callbacks must not become a second receive-pump failure path.
        }
        return;
    }
  }

  async #close(reason?: string): Promise<void> {
    if (this.#state !== "closed") {
      this.#setState("closing");
    }
    this.#discoveryGate?.reject(new CoreClientControllerError("controller_closed", "The client controller is closed"));
    try {
      await this.#client.close(reason);
      await this.#pumpPromise;
    } finally {
      this.#finishClosed();
    }
  }

  async #fail(error: unknown, fallbackCode: string, fallbackMessage: string): Promise<CoreClientControllerError> {
    const failure = toControllerError(error, fallbackCode, fallbackMessage);
    this.#clearCommand();
    this.#error = toFailure(failure, fallbackCode, fallbackMessage);
    if (this.#state !== "closed" && this.#state !== "closing") {
      this.#setState("failed");
    }
    this.#discoveryGate?.reject(failure);
    try {
      await this.#client.close(failure.message);
    } catch {
      // The original client failure is authoritative.
    }
    return failure;
  }

  #assertStarted(): void {
    if (this.#state === "created") {
      throw new CoreClientControllerError("controller_not_started", "Start the client controller first");
    }
    if (this.#state === "closed" || this.#state === "closing") {
      throw new CoreClientControllerError("controller_closed", "The client controller is closed");
    }
    if (this.#state === "failed") {
      throw new CoreClientControllerError("controller_failed", "The client controller has failed", this.#error);
    }
  }

  #assertReady(): void {
    this.#assertStarted();
    if (this.#state !== "ready") {
      throw new CoreClientControllerError("controller_not_ready", "The client controller is not ready for a command");
    }
  }

  #clearCommand(): void {
    this.#activeCommand = undefined;
    this.#scene = new SceneStateBuffer();
  }

  #finishClosed(): void {
    this.#clearCommand();
    if (this.#state !== "failed") {
      this.#state = "closed";
      this.#emit();
    }
    this.#discoveryGate?.reject(new CoreClientControllerError("controller_closed", "The client controller is closed"));
  }

  #setState(state: CoreClientControllerState): void {
    this.#state = state;
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) {
      this.#notify(listener);
    }
  }

  #notify(listener: CoreClientSnapshotListener): void {
    try {
      listener(this.snapshot);
    } catch {
      // Subscriber failures must not corrupt the protocol receive pump.
    }
  }
}

interface PromiseGate<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

function createPromiseGate<T>(): PromiseGate<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolveValue, rejectValue) => {
    resolve = resolveValue;
    reject = rejectValue;
  });
  return { promise, resolve, reject };
}

function sameIdentity(left: CommandIdentity | undefined, right: CommandIdentity): boolean {
  return left !== undefined && left.extensionId === right.extensionId && left.commandName === right.commandName;
}

function toControllerError(error: unknown, fallbackCode: string, fallbackMessage: string): CoreClientControllerError {
  if (error instanceof CoreClientControllerError) {
    return error;
  }
  if (error instanceof CoreClientError) {
    return new CoreClientControllerError(error.code, error.message, error.details);
  }
  if (isRecord(error) && typeof error.code === "string" && typeof error.message === "string") {
    return new CoreClientControllerError(error.code, error.message, error.details);
  }
  if (error instanceof Error) {
    return new CoreClientControllerError(fallbackCode, error.message, error);
  }
  return new CoreClientControllerError(fallbackCode, fallbackMessage, error);
}

function toFailure(error: unknown, fallbackCode: string, fallbackMessage: string): CoreClientFailure {
  const controllerError = toControllerError(error, fallbackCode, fallbackMessage);
  return controllerError.details === undefined
    ? { code: controllerError.code, message: controllerError.message }
    : { code: controllerError.code, message: controllerError.message, details: controllerError.details };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
