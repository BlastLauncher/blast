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

export type ExtensionPreferenceType =
  | "appPicker"
  | "checkbox"
  | "dropdown"
  | "password"
  | "textfield"
  | "file"
  | "directory";
export type ExtensionPreferenceScalar = string | number | boolean;
export type ExtensionPreferencePlatformValue = Readonly<Record<string, ExtensionPreferenceScalar>>;
export type ExtensionPreferenceMetadataValue = ExtensionPreferenceScalar | ExtensionPreferencePlatformValue;

export interface ExtensionPreferenceDataItem {
  readonly title: string;
  readonly value: string;
}

/** JSON-safe measured metadata for one Raycast manifest preference. */
export interface ExtensionPreferenceMetadata {
  readonly name: string;
  readonly type: ExtensionPreferenceType;
  readonly required: boolean;
  readonly title: string;
  readonly description: string;
  readonly value?: ExtensionPreferenceMetadataValue;
  readonly default?: ExtensionPreferenceMetadataValue;
  readonly placeholder?: string;
  readonly label?: string;
  readonly data?: readonly ExtensionPreferenceDataItem[];
}

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
  readonly preferences?: Readonly<Record<string, ExtensionPreferenceScalar>>;
  /** Full measured manifest preference declarations keyed by preference name. */
  readonly preferenceMetadata?: Readonly<Record<string, ExtensionPreferenceMetadata>>;
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
  if (value.preferences !== undefined) {
    if (!isRecord(value.preferences)) {
      issues.push({ path: `${path}.preferences`, message: "Expected an object" });
    } else {
      for (const key of Object.keys(value.preferences)) {
        const preference = value.preferences[key];
        if (!isPreferenceScalar(preference)) {
          issues.push({ path: `${path}.preferences.${key}`, message: "Expected a primitive preference value" });
        }
      }
    }
  }
  if (value.preferenceMetadata !== undefined) {
    validatePreferenceMetadata(value.preferenceMetadata, `${path}.preferenceMetadata`, issues);
  }
}

function validatePreferenceMetadata(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected an object" });
    return;
  }
  for (const key of Object.keys(value)) {
    const metadataPath = `${path}.${key}`;
    const metadata = value[key];
    if (!isRecord(metadata)) {
      issues.push({ path: metadataPath, message: "Expected an object" });
      continue;
    }
    validateNonEmptyString(metadata.name, `${metadataPath}.name`, issues);
    if (metadata.name !== key) {
      issues.push({ path: `${metadataPath}.name`, message: "Expected the metadata key to match the preference name" });
    }
    if (
      metadata.type !== "appPicker" &&
      metadata.type !== "checkbox" &&
      metadata.type !== "dropdown" &&
      metadata.type !== "password" &&
      metadata.type !== "textfield" &&
      metadata.type !== "file" &&
      metadata.type !== "directory"
    ) {
      issues.push({ path: `${metadataPath}.type`, message: "Expected a valid preference type" });
    }
    if (typeof metadata.required !== "boolean") {
      issues.push({ path: `${metadataPath}.required`, message: "Expected a boolean" });
    }
    validateString(metadata.title, `${metadataPath}.title`, issues);
    validateString(metadata.description, `${metadataPath}.description`, issues);
    if (metadata.value !== undefined) {
      validatePreferenceMetadataValue(metadata.value, `${metadataPath}.value`, issues);
    }
    if (metadata.default !== undefined) {
      validatePreferenceMetadataValue(metadata.default, `${metadataPath}.default`, issues);
    }
    if (metadata.placeholder !== undefined) {
      validateString(metadata.placeholder, `${metadataPath}.placeholder`, issues);
    }
    if (metadata.label !== undefined) {
      validateString(metadata.label, `${metadataPath}.label`, issues);
    }
    if (metadata.data !== undefined) {
      if (!Array.isArray(metadata.data)) {
        issues.push({ path: `${metadataPath}.data`, message: "Expected an array" });
      } else {
        metadata.data.forEach((item, index) => {
          const itemPath = `${metadataPath}.data[${index}]`;
          if (!isRecord(item)) {
            issues.push({ path: itemPath, message: "Expected an object" });
            return;
          }
          validateString(item.title, `${itemPath}.title`, issues);
          validateString(item.value, `${itemPath}.value`, issues);
        });
      }
    }
  }
}

function validatePreferenceMetadataValue(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (isPreferenceScalar(value)) {
    return;
  }
  if (!isRecord(value)) {
    issues.push({ path, message: "Expected a scalar or platform value map" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!isPreferenceScalar(value[key])) {
      issues.push({ path: `${path}.${key}`, message: "Expected a primitive platform preference value" });
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

function validateString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string") {
    issues.push({ path, message: "Expected a string" });
  }
}

function isPreferenceScalar(value: unknown): value is ExtensionPreferenceScalar {
  return (
    typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid<T>(path: string, message: string): ValidationResult<T> {
  return { ok: false, issues: [{ path, message }] };
}
