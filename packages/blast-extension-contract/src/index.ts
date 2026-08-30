import {
  validateProtocolEnvelope,
  type ProtocolEnvelope,
  type ValidationIssue,
  type ValidationResult,
} from "@blastlauncher/protocol";

export const EXTENSION_INITIALIZE_MESSAGE = "extension.initialize" as const;
export const EXTENSION_READY_MESSAGE = "extension.ready" as const;

export type ExtensionEntryPointMode = "no-view" | "view" | "menu-bar";
export type ExtensionEntryPointType = "command" | "tool";
export type ExtensionAppearance = "light" | "dark";
export type ExtensionTextSize = "medium" | "large";

/** Host-owned scalar values used to populate Raycast's environment object. */
export interface ExtensionEnvironmentMetadata {
  readonly raycastVersion?: string;
  readonly entryPointType?: ExtensionEntryPointType;
  readonly isDevelopment?: boolean;
  readonly appearance?: ExtensionAppearance;
  readonly textSize?: ExtensionTextSize;
}

export interface ExtensionDescriptor {
  readonly extensionId: string;
  readonly commandName: string;
  readonly entrypoint: string;
  readonly rootDirectory: string;
  /** Manifest title used by environment.extensionName. */
  readonly extensionName?: string;
  /** Manifest owner, falling back to author, used by environment.ownerOrAuthorName. */
  readonly ownerOrAuthorName?: string;
  /** Raycast manifest command mode; omitted by older manually-built descriptors. */
  readonly entryPointMode?: ExtensionEntryPointMode;
  /** Optional host-owned scalar environment values. */
  readonly environment?: ExtensionEnvironmentMetadata;
  /** Manifest preference defaults resolved by the trusted catalog. */
  readonly preferences?: Readonly<Record<string, string | number | boolean>>;
}

export interface ExtensionInitializePayload {
  readonly descriptor: ExtensionDescriptor;
}

export interface ExtensionReadyPayload {
  readonly extensionId: string;
  readonly commandName: string;
}

export type ExtensionInitializeMessage = ProtocolEnvelope<
  typeof EXTENSION_INITIALIZE_MESSAGE,
  ExtensionInitializePayload
>;

export type ExtensionReadyMessage = ProtocolEnvelope<typeof EXTENSION_READY_MESSAGE, ExtensionReadyPayload>;

export function validateExtensionInitializeMessage(value: unknown): ValidationResult<ExtensionInitializeMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== EXTENSION_INITIALIZE_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(EXTENSION_INITIALIZE_MESSAGE)}`);
  }
  if (!isRecord(envelope.value.payload) || !isRecord(envelope.value.payload.descriptor)) {
    return invalid("$.payload.descriptor", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validateDescriptor(envelope.value.payload.descriptor, "$.payload.descriptor", issues);
  return issues.length === 0
    ? { ok: true, value: envelope.value as ExtensionInitializeMessage }
    : { ok: false, issues };
}

export function validateExtensionReadyMessage(value: unknown): ValidationResult<ExtensionReadyMessage> {
  const envelope = validateProtocolEnvelope(value);
  if (!envelope.ok) {
    return envelope;
  }
  if (envelope.value.type !== EXTENSION_READY_MESSAGE) {
    return invalid("$.type", `Expected ${JSON.stringify(EXTENSION_READY_MESSAGE)}`);
  }
  if (!isRecord(envelope.value.payload)) {
    return invalid("$.payload", "Expected an object");
  }

  const issues: ValidationIssue[] = [];
  validateNonEmptyString(envelope.value.payload.extensionId, "$.payload.extensionId", issues);
  validateNonEmptyString(envelope.value.payload.commandName, "$.payload.commandName", issues);
  return issues.length === 0 ? { ok: true, value: envelope.value as ExtensionReadyMessage } : { ok: false, issues };
}

export function extensionIdentityMatches(
  descriptor: Pick<ExtensionDescriptor, "extensionId" | "commandName">,
  identity: ExtensionReadyPayload,
): boolean {
  return descriptor.extensionId === identity.extensionId && descriptor.commandName === identity.commandName;
}

function validateDescriptor(value: Record<string, unknown>, path: string, issues: ValidationIssue[]): void {
  validateNonEmptyString(value.extensionId, `${path}.extensionId`, issues);
  validateNonEmptyString(value.commandName, `${path}.commandName`, issues);
  validateNonEmptyString(value.entrypoint, `${path}.entrypoint`, issues);
  validateNonEmptyString(value.rootDirectory, `${path}.rootDirectory`, issues);
  if (value.extensionName !== undefined) {
    validateNonEmptyString(value.extensionName, `${path}.extensionName`, issues);
  }
  if (value.ownerOrAuthorName !== undefined) {
    validateNonEmptyString(value.ownerOrAuthorName, `${path}.ownerOrAuthorName`, issues);
  }
  if (
    value.entryPointMode !== undefined &&
    value.entryPointMode !== "no-view" &&
    value.entryPointMode !== "view" &&
    value.entryPointMode !== "menu-bar"
  ) {
    issues.push({ path: `${path}.entryPointMode`, message: "Expected a valid entrypoint mode" });
  }
  if (value.environment !== undefined) {
    validateEnvironmentMetadata(value.environment, `${path}.environment`, issues);
  }
  if (value.preferences === undefined) {
    return;
  }
  if (!isRecord(value.preferences)) {
    issues.push({ path: `${path}.preferences`, message: "Expected an object" });
    return;
  }
  for (const key of Object.keys(value.preferences)) {
    const preference = value.preferences[key];
    if (typeof preference !== "string" && typeof preference !== "number" && typeof preference !== "boolean") {
      issues.push({ path: `${path}.preferences.${key}`, message: "Expected a primitive preference value" });
    }
  }
}

function validateEnvironmentMetadata(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  if (value.raycastVersion !== undefined) {
    validateNonEmptyString(value.raycastVersion, `${path}.raycastVersion`, issues);
  }
  if (value.entryPointType !== undefined && value.entryPointType !== "command" && value.entryPointType !== "tool") {
    issues.push({ path: `${path}.entryPointType`, message: "Expected a valid entrypoint type" });
  }
  if (value.isDevelopment !== undefined && typeof value.isDevelopment !== "boolean") {
    issues.push({ path: `${path}.isDevelopment`, message: "Expected a boolean" });
  }
  if (value.appearance !== undefined && value.appearance !== "light" && value.appearance !== "dark") {
    issues.push({ path: `${path}.appearance`, message: "Expected a valid appearance" });
  }
  if (value.textSize !== undefined && value.textSize !== "medium" && value.textSize !== "large") {
    issues.push({ path: `${path}.textSize`, message: "Expected a valid text size" });
  }
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
