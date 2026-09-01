import type { ExternalExtensionPackage, ExternalExtensionStoreErrorCode } from "@blastlauncher/core-node";

export type V2ExtensionPackageOperation = "install" | "update" | "remove" | "rollback";

export type V2ExtensionPackageErrorCode =
  | ExternalExtensionStoreErrorCode
  | "package_lifecycle_unavailable"
  | "package_source_cancelled";

export interface V2ExtensionPackageSummary {
  readonly extensionId: string;
  readonly version?: string;
  readonly sourceKind: "external";
}

export interface V2ExtensionPackageError {
  readonly code: V2ExtensionPackageErrorCode;
  readonly message: string;
}

export type V2ExtensionPackageOperationResult =
  | { readonly ok: true; readonly package: V2ExtensionPackageSummary }
  | { readonly ok: false; readonly error: V2ExtensionPackageError };

export interface V2ExtensionPackageRendererAPI {
  isEnabled(): Promise<boolean>;
  install(): Promise<V2ExtensionPackageOperationResult>;
  update(): Promise<V2ExtensionPackageOperationResult>;
  remove(extensionId: string): Promise<V2ExtensionPackageOperationResult>;
  rollback(extensionId: string): Promise<V2ExtensionPackageOperationResult>;
}

export interface V2ExtensionPackageStore {
  install(sourcePath: string): Promise<ExternalExtensionPackage>;
  update(sourcePath: string): Promise<ExternalExtensionPackage>;
  remove(extensionId: string): Promise<ExternalExtensionPackage>;
  rollback(extensionId: string): Promise<ExternalExtensionPackage>;
}

export function toV2ExtensionPackageSummary(value: ExternalExtensionPackage): V2ExtensionPackageSummary {
  return {
    extensionId: value.extensionId,
    ...(value.version === undefined ? {} : { version: value.version }),
    sourceKind: value.sourceKind,
  };
}

export function createV2ExtensionPackageSuccess(value: ExternalExtensionPackage): V2ExtensionPackageOperationResult {
  return { ok: true, package: toV2ExtensionPackageSummary(value) };
}

export function createV2ExtensionPackageFailure(
  code: V2ExtensionPackageErrorCode,
  message: string,
): V2ExtensionPackageOperationResult {
  return { ok: false, error: { code, message } };
}

export async function runV2ExtensionPackageSourceOperation(
  store: V2ExtensionPackageStore | undefined,
  operation: Extract<V2ExtensionPackageOperation, "install" | "update">,
  selectSource: () => Promise<string | undefined>,
): Promise<V2ExtensionPackageOperationResult> {
  if (store === undefined) {
    return createV2ExtensionPackageFailure(
      "package_lifecycle_unavailable",
      "External package management is unavailable in this V2 mode.",
    );
  }

  let source: string | undefined;
  try {
    source = await selectSource();
  } catch {
    return createV2ExtensionPackageFailure(
      "package_operation_failed",
      "The extension package chooser could not be opened.",
    );
  }
  if (source === undefined) {
    return createV2ExtensionPackageFailure("package_source_cancelled", "Extension package selection cancelled.");
  }

  try {
    const installed = operation === "install" ? await store.install(source) : await store.update(source);
    return createV2ExtensionPackageSuccess(installed);
  } catch (error) {
    return reduceV2ExtensionPackageStoreError(error);
  }
}

export async function runV2ExtensionPackageIdentityOperation(
  store: V2ExtensionPackageStore | undefined,
  operation: Extract<V2ExtensionPackageOperation, "remove" | "rollback">,
  value: unknown,
): Promise<V2ExtensionPackageOperationResult> {
  const extensionId = parseV2ExtensionPackageId(value);
  if (extensionId === undefined) {
    return createV2ExtensionPackageFailure(
      "invalid_extension_package",
      "Extension package operations require a non-empty extension ID.",
    );
  }
  if (store === undefined) {
    return createV2ExtensionPackageFailure(
      "package_lifecycle_unavailable",
      "External package management is unavailable in this V2 mode.",
    );
  }

  try {
    const packageMetadata =
      operation === "remove" ? await store.remove(extensionId) : await store.rollback(extensionId);
    return createV2ExtensionPackageSuccess(packageMetadata);
  } catch (error) {
    return reduceV2ExtensionPackageStoreError(error);
  }
}

export function parseV2ExtensionPackageId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 256 ? value : undefined;
}

const STORE_ERROR_CODES: readonly V2ExtensionPackageErrorCode[] = [
  "archive_invalid",
  "archive_too_large",
  "extension_backup_exists",
  "extension_not_installed",
  "extension_store_invalid_options",
  "extension_target_unsafe",
  "extension_already_installed",
  "invalid_extension_package",
  "invalid_package_source",
  "package_source_unsafe",
  "package_stage_unsafe",
  "package_operation_failed",
  "rollback_unavailable",
];

function reduceV2ExtensionPackageStoreError(error: unknown): V2ExtensionPackageOperationResult {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    if (code !== undefined && (STORE_ERROR_CODES as readonly string[]).includes(code)) {
      const storeCode = code as ExternalExtensionStoreErrorCode;
      return createV2ExtensionPackageFailure(storeCode, STORE_ERROR_MESSAGES[storeCode]);
    }
  }
  return createV2ExtensionPackageFailure(
    "package_operation_failed",
    "The external extension package operation failed.",
  );
}

const STORE_ERROR_MESSAGES: Readonly<Record<ExternalExtensionStoreErrorCode, string>> = {
  archive_invalid: "The selected extension archive is invalid or unsafe.",
  archive_too_large: "The selected extension package exceeds the size limit.",
  extension_backup_exists: "A previous package must be rolled back or removed first.",
  extension_not_installed: "The requested extension package is not installed.",
  extension_store_invalid_options: "External package storage is not configured correctly.",
  extension_target_unsafe: "Managed extension storage is unsafe.",
  extension_already_installed: "An extension with this name is already installed.",
  invalid_extension_package: "The selected package is not a compatible extension.",
  invalid_package_source: "Select an extension directory or supported tar archive.",
  package_source_unsafe: "The selected package contains unsafe filesystem entries.",
  package_stage_unsafe: "The staged package contains unsafe filesystem entries.",
  package_operation_failed: "The external extension package operation failed.",
  rollback_unavailable: "No recoverable package is available for rollback.",
};
