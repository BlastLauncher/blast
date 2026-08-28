import {
  validateProtocolEnvelope,
  type ProtocolEnvelope,
  type ValidationIssue,
  type ValidationResult,
} from "@blastlauncher/protocol";

export const CAPABILITY_REQUEST_MESSAGE = "capability.request" as const;
export const CAPABILITY_RESPONSE_MESSAGE = "capability.response" as const;

export type CapabilityArgumentValue = string | number | boolean;

export type CapabilityValue = string | number | boolean | null;

export type CapabilityOutcome = "succeeded" | "denied" | "failed";

export interface CapabilityRequestPayload {
  readonly requestId: string;
  readonly extensionId: string;
  readonly commandName: string;
  readonly capability: string;
  readonly operation: string;
  readonly arguments?: Readonly<Record<string, CapabilityArgumentValue>>;
}

export interface CapabilityResponsePayload {
  readonly requestId: string;
  readonly outcome: CapabilityOutcome;
  readonly value?: CapabilityValue;
  readonly code?: string;
  readonly message?: string;
}

export type CapabilityRequestMessage = ProtocolEnvelope<typeof CAPABILITY_REQUEST_MESSAGE, CapabilityRequestPayload>;

export type CapabilityResponseMessage = ProtocolEnvelope<typeof CAPABILITY_RESPONSE_MESSAGE, CapabilityResponsePayload>;

export interface CapabilityRequest {
  readonly requestId: string;
  readonly extensionId: string;
  readonly commandName: string;
  readonly capability: string;
  readonly operation: string;
  readonly arguments: Readonly<Record<string, CapabilityArgumentValue>>;
}

export type CapabilityDecision = "allow" | "deny";

export interface CapabilityPolicy {
  decide(request: CapabilityRequest): CapabilityDecision | Promise<CapabilityDecision>;
}

export interface CapabilityProvider {
  /** Returning undefined yields a succeeded response without a value. */
  perform(request: CapabilityRequest, signal?: AbortSignal): Promise<CapabilityValue | undefined>;
}

export interface CapabilityBrokerOptions {
  /** Defaults to a policy that denies every request. */
  readonly policy?: CapabilityPolicy;
  /** Capabilities without a provider are denied with `unknown_capability`. */
  readonly providers?: Readonly<Record<string, CapabilityProvider>>;
}

/**
 * Enforces the capability boundary between extensions and host operations.
 * The default policy denies every request, so a capability works only when a
 * provider is registered and the policy allows the extension identity,
 * capability, and operation. Provider failures become structured `failed`
 * responses instead of transport errors.
 */
export class CapabilityBroker {
  readonly #policy: CapabilityPolicy;
  readonly #providers: Readonly<Record<string, CapabilityProvider>>;

  constructor(options: CapabilityBrokerOptions = {}) {
    this.#policy = options.policy ?? denyAllPolicy;
    this.#providers = options.providers ?? {};
  }

  async execute(request: CapabilityRequest, signal?: AbortSignal): Promise<CapabilityResponsePayload> {
    const provider = this.#providers[request.capability];
    if (provider === undefined) {
      return denied(request.requestId, "unknown_capability", `No provider for capability "${request.capability}"`);
    }

    const decision = await this.#policy.decide(request);
    if (decision !== "allow") {
      return denied(
        request.requestId,
        "capability_denied",
        `Capability "${request.capability}.${request.operation}" is not granted to this extension`,
      );
    }

    try {
      const value = await provider.perform(request, signal);
      return value === undefined
        ? { requestId: request.requestId, outcome: "succeeded" }
        : { requestId: request.requestId, outcome: "succeeded", value };
    } catch (error) {
      return {
        requestId: request.requestId,
        outcome: "failed",
        code: "capability_failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const denyAllPolicy: CapabilityPolicy = {
  decide() {
    return "deny";
  },
};

export interface CapabilityGrant {
  readonly extensionId: string;
  readonly capability: string;
  readonly operation: string;
}

/**
 * Deterministic allow-list policy: a request is allowed only when an exact
 * grant for the extension identity, capability, and operation exists.
 */
export function createGrantListPolicy(grants: readonly CapabilityGrant[]): CapabilityPolicy {
  return {
    decide(request) {
      const granted = grants.some(
        (grant) =>
          grant.extensionId === request.extensionId &&
          grant.capability === request.capability &&
          grant.operation === request.operation,
      );
      return granted ? "allow" : "deny";
    },
  };
}

export function validateCapabilityRequestMessage(value: unknown): ValidationResult<CapabilityRequestMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== CAPABILITY_REQUEST_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(CAPABILITY_REQUEST_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateRequestPayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as CapabilityRequestMessage } : { ok: false, issues };
}

export function validateCapabilityRequestPayload(value: unknown): ValidationResult<CapabilityRequestPayload> {
  const issues: ValidationIssue[] = [];
  validateRequestPayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as CapabilityRequestPayload } : { ok: false, issues };
}

function validateRequestPayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  for (const field of ["requestId", "extensionId", "commandName", "capability", "operation"]) {
    validateNonEmptyString(value[field], `${basePath}.${field}`, issues);
  }
  if (value.arguments === undefined) {
    return;
  }
  if (!isRecord(value.arguments)) {
    issues.push({ path: `${basePath}.arguments`, message: "Expected an object" });
    return;
  }
  for (const key of Object.keys(value.arguments)) {
    const argument = value.arguments[key];
    if (typeof argument !== "string" && typeof argument !== "number" && typeof argument !== "boolean") {
      issues.push({
        path: `${basePath}.arguments.${key}`,
        message: "Expected a string, number, or boolean argument",
      });
    }
  }
}

export function validateCapabilityResponseMessage(value: unknown): ValidationResult<CapabilityResponseMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== CAPABILITY_RESPONSE_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(CAPABILITY_RESPONSE_MESSAGE)}`);
  }

  const issues: ValidationIssue[] = [];
  validateResponsePayload(envelope.value.payload, "$.payload", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as CapabilityResponseMessage } : { ok: false, issues };
}

export function validateCapabilityResponsePayload(value: unknown): ValidationResult<CapabilityResponsePayload> {
  const issues: ValidationIssue[] = [];
  validateResponsePayload(value, "$", issues);
  return issues.length === 0 ? { ok: true, value: value as CapabilityResponsePayload } : { ok: false, issues };
}

function validateResponsePayload(value: unknown, basePath: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path: basePath, message: "Expected an object" });
    return;
  }
  validateNonEmptyString(value.requestId, `${basePath}.requestId`, issues);
  if (value.outcome !== "succeeded" && value.outcome !== "denied" && value.outcome !== "failed") {
    issues.push({ path: `${basePath}.outcome`, message: "Unknown capability outcome" });
    return;
  }
  if ((value.outcome === "denied" || value.outcome === "failed") && typeof value.code !== "string") {
    issues.push({ path: `${basePath}.code`, message: "Denied and failed responses require a code" });
  }
  if (value.code !== undefined) {
    validateNonEmptyString(value.code, `${basePath}.code`, issues);
  }
  if (value.message !== undefined && typeof value.message !== "string") {
    issues.push({ path: `${basePath}.message`, message: "Expected a string" });
  }
  if (value.value !== undefined && value.value !== null) {
    const primitive =
      typeof value.value === "string" || typeof value.value === "number" || typeof value.value === "boolean";
    if (!primitive) {
      issues.push({ path: `${basePath}.value`, message: "Expected a primitive or null value" });
    }
  }
}

function denied(requestId: string, code: string, message: string): CapabilityResponsePayload {
  return { requestId, outcome: "denied", code, message };
}

function validateNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.length === 0) {
    issues.push({ path, message: "Expected a non-empty string" });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}

/**
 * Reference in-memory provider for the `local-storage` capability: values are
 * namespaced by extension identity and kept per broker instance. Launchers
 * replace this with a persistent provider; the wire contract stays identical.
 */
export function createInMemoryLocalStorageProvider(): CapabilityProvider {
  const namespaces = new Map<string, Map<string, string | number | boolean>>();
  const namespaceFor = (extensionId: string): Map<string, string | number | boolean> => {
    const existing = namespaces.get(extensionId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, string | number | boolean>();
    namespaces.set(extensionId, created);
    return created;
  };

  return {
    async perform(request) {
      const namespace = namespaceFor(request.extensionId);
      const rawKey = request.arguments === undefined ? undefined : request.arguments["key"];
      const key = typeof rawKey === "string" ? rawKey : undefined;
      if (request.operation !== "clear" && (key === undefined || key.length === 0)) {
        throw new Error("local-storage operations require a key");
      }
      const storageKey = key ?? "";
      switch (request.operation) {
        case "get":
          return namespace.has(storageKey) ? (namespace.get(storageKey) as string | number | boolean) : undefined;
        case "set": {
          const value = request.arguments["value"];
          if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
            throw new Error("local-storage set requires a primitive value");
          }
          namespace.set(storageKey, value);
          return undefined;
        }
        case "remove":
          namespace.delete(storageKey);
          return undefined;
        case "clear":
          namespace.clear();
          return undefined;
        default:
          throw new Error(`Unknown local-storage operation "${request.operation}"`);
      }
    },
  };
}
