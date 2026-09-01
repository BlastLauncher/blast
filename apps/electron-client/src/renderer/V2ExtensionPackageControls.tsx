import { useState } from "react";

import type { CoreClientSnapshot } from "@blastlauncher/client";

import type {
  V2ExtensionPackageOperation,
  V2ExtensionPackageOperationResult,
  V2ExtensionPackageRendererAPI,
} from "../v2ExtensionPackageTypes";

export interface V2ExtensionPackageControlsProps {
  readonly api: V2ExtensionPackageRendererAPI;
  readonly commands: CoreClientSnapshot["commands"];
  readonly disabled: boolean;
  readonly enabled: boolean;
  readonly onRefresh: () => Promise<void>;
}

type V2ExtensionPackageConfirmationOperation = Extract<V2ExtensionPackageOperation, "remove" | "rollback">;

interface V2ExtensionPackageConfirmationProps {
  readonly operation: V2ExtensionPackageConfirmationOperation;
  readonly extensionId: string;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

interface V2ExtensionPackageActiveOperation {
  readonly operation: V2ExtensionPackageOperation;
  readonly extensionId?: string;
}

export function V2ExtensionPackageControls({
  api,
  commands,
  disabled,
  enabled,
  onRefresh,
}: V2ExtensionPackageControlsProps): React.JSX.Element | null {
  const [activeOperation, setActiveOperation] = useState<V2ExtensionPackageActiveOperation | undefined>();
  const [confirmation, setConfirmation] = useState<
    { readonly operation: V2ExtensionPackageConfirmationOperation; readonly extensionId: string } | undefined
  >();
  const [status, setStatus] = useState<string | undefined>();
  if (!enabled) {
    return null;
  }

  const extensionIds: string[] = [
    ...new Set(commands.filter((command) => command.sourceKind === "external").map((command) => command.extensionId)),
  ];
  const controlsDisabled = disabled || activeOperation !== undefined || confirmation !== undefined;
  const operationDisabled = disabled || activeOperation !== undefined;

  const run = async (operation: V2ExtensionPackageOperation, extensionId?: string): Promise<void> => {
    setConfirmation(undefined);
    setActiveOperation({ operation, ...(extensionId === undefined ? {} : { extensionId }) });
    setStatus(describeV2ExtensionPackageProgress(operation, extensionId));
    try {
      const result = await execute(api, operation, extensionId);
      if (result.ok === false) {
        setStatus(
          result.error.code === "package_source_cancelled"
            ? describeV2ExtensionPackageCancellation(operation)
            : result.error.message,
        );
        return;
      }
      const version = result.package.version === undefined ? "" : ` v${result.package.version}`;
      setStatus(`${operationLabel(operation)} ${result.package.extensionId}${version}.`);
      try {
        await onRefresh();
      } catch {
        setStatus(`${operationLabel(operation)} ${result.package.extensionId}${version}; catalog refresh failed.`);
      }
    } catch {
      setStatus("The external extension package operation could not be completed.");
    } finally {
      setActiveOperation(undefined);
    }
  };

  const request = (operation: V2ExtensionPackageOperation, extensionId?: string): void => {
    if (operation === "remove" || operation === "rollback") {
      if (extensionId === undefined) {
        return;
      }
      setStatus(undefined);
      setConfirmation({ operation, extensionId });
      return;
    }
    void run(operation);
  };

  return (
    <section
      aria-label="External extension packages"
      aria-busy={activeOperation !== undefined}
      className="mx-4 mt-3 rounded-lg border border-white/10 bg-white/5 p-3"
      data-v2-package-controls="true"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-white/80">External packages</div>
          <div className="text-[11px] text-white/40">
            {extensionIds.length === 0
              ? "Import a local directory or archive."
              : `${extensionIds.length} managed package${extensionIds.length === 1 ? "" : "s"}`}
          </div>
        </div>
        <button
          className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
          disabled={controlsDisabled}
          onClick={() => request("install")}
          type="button"
        >
          {activeOperation?.operation === "install" ? "Importing…" : "Import package"}
        </button>
        {extensionIds.length > 0 && (
          <button
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            disabled={controlsDisabled}
            onClick={() => request("update")}
            type="button"
          >
            {activeOperation?.operation === "update" ? "Updating…" : "Update package"}
          </button>
        )}
      </div>
      {extensionIds.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {extensionIds.map((extensionId) => (
            <li className="flex items-center gap-2 text-xs" key={extensionId}>
              <span className="min-w-0 flex-1 truncate text-white/65">{extensionId}</span>
              <button
                aria-label={`Remove ${extensionId}`}
                className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
                disabled={controlsDisabled}
                onClick={() => request("remove", extensionId)}
                type="button"
              >
                {activeOperation?.operation === "remove" && activeOperation.extensionId === extensionId
                  ? "Removing…"
                  : "Remove"}
              </button>
              <button
                aria-label={`Rollback ${extensionId}`}
                className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
                disabled={controlsDisabled}
                onClick={() => request("rollback", extensionId)}
                type="button"
              >
                {activeOperation?.operation === "rollback" && activeOperation.extensionId === extensionId
                  ? "Rolling back…"
                  : "Rollback"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {confirmation !== undefined && (
        <V2ExtensionPackageConfirmation
          disabled={operationDisabled}
          extensionId={confirmation.extensionId}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void run(confirmation.operation, confirmation.extensionId)}
          operation={confirmation.operation}
        />
      )}
      {status !== undefined && (
        <div aria-atomic="true" aria-live="polite" className="mt-2 text-[11px] text-white/55" role="status">
          {status}
        </div>
      )}
    </section>
  );
}

export function V2ExtensionPackageConfirmation({
  operation,
  extensionId,
  disabled,
  onCancel,
  onConfirm,
}: V2ExtensionPackageConfirmationProps): React.JSX.Element {
  const action = operation === "remove" ? "Remove" : "Rollback";
  const message =
    operation === "remove"
      ? `Remove ${extensionId} from managed packages?`
      : `Restore the previous package for ${extensionId}?`;

  return (
    <div
      aria-label={`${action} ${extensionId} confirmation`}
      className="mt-3 flex items-center gap-2 rounded-md border border-amber-300/20 bg-amber-300/10 px-2.5 py-2 text-xs"
      role="alert"
    >
      <span className="min-w-0 flex-1 text-amber-50">{message}</span>
      <button
        className="rounded px-2 py-1 text-white/65 hover:bg-white/10 hover:text-white disabled:opacity-50"
        onClick={onCancel}
        type="button"
      >
        Cancel
      </button>
      <button
        className="rounded bg-amber-300/20 px-2 py-1 text-amber-50 hover:bg-amber-300/30 disabled:opacity-50"
        disabled={disabled}
        onClick={onConfirm}
        type="button"
      >
        {action}
      </button>
    </div>
  );
}

export function describeV2ExtensionPackageProgress(
  operation: V2ExtensionPackageOperation,
  extensionId?: string,
): string {
  if (operation === "install") {
    return "Importing package…";
  }
  if (operation === "update") {
    return "Updating package…";
  }
  if (operation === "remove") {
    return `Removing ${extensionId ?? "package"}…`;
  }
  return `Restoring ${extensionId ?? "package"}…`;
}

export function describeV2ExtensionPackageCancellation(operation: V2ExtensionPackageOperation): string {
  if (operation === "install") {
    return "Import cancelled; no package was changed.";
  }
  if (operation === "update") {
    return "Update cancelled; no package was changed.";
  }
  return "Package operation cancelled; no package was changed.";
}

async function execute(
  api: V2ExtensionPackageRendererAPI,
  operation: V2ExtensionPackageOperation,
  extensionId: string | undefined,
): Promise<V2ExtensionPackageOperationResult> {
  if (operation === "install") {
    return api.install();
  }
  if (operation === "update") {
    return api.update();
  }
  if (extensionId === undefined) {
    return {
      ok: false,
      error: {
        code: "invalid_extension_package",
        message: "An extension ID is required for this package operation.",
      },
    };
  }
  return operation === "remove" ? api.remove(extensionId) : api.rollback(extensionId);
}

function operationLabel(operation: V2ExtensionPackageOperation): string {
  if (operation === "install") {
    return "Imported";
  }
  if (operation === "update") {
    return "Updated";
  }
  if (operation === "remove") {
    return "Removed";
  }
  return "Rolled back";
}
