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

export function V2ExtensionPackageControls({
  api,
  commands,
  disabled,
  enabled,
  onRefresh,
}: V2ExtensionPackageControlsProps): React.JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  if (!enabled) {
    return null;
  }

  const extensionIds: string[] = [
    ...new Set(commands.filter((command) => command.sourceKind === "external").map((command) => command.extensionId)),
  ];
  const controlsDisabled = disabled || busy;

  const run = async (operation: V2ExtensionPackageOperation, extensionId?: string): Promise<void> => {
    setBusy(true);
    setStatus(undefined);
    try {
      const result = await execute(api, operation, extensionId);
      if (result.ok === false) {
        if (result.error.code !== "package_source_cancelled") {
          setStatus(result.error.message);
        }
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
      setBusy(false);
    }
  };

  return (
    <section
      aria-label="External extension packages"
      className="mx-4 mt-3 rounded-lg border border-white/10 bg-white/5 p-3"
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
          onClick={() => void run("install")}
          type="button"
        >
          Import package
        </button>
        {extensionIds.length > 0 && (
          <button
            className="rounded-md bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20 disabled:opacity-50"
            disabled={controlsDisabled}
            onClick={() => void run("update")}
            type="button"
          >
            Update package
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
                onClick={() => void run("remove", extensionId)}
                type="button"
              >
                Remove
              </button>
              <button
                aria-label={`Rollback ${extensionId}`}
                className="rounded px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-50"
                disabled={controlsDisabled}
                onClick={() => void run("rollback", extensionId)}
                type="button"
              >
                Rollback
              </button>
            </li>
          ))}
        </ul>
      )}
      {status !== undefined && (
        <div aria-live="polite" className="mt-2 text-[11px] text-white/55" role="status">
          {status}
        </div>
      )}
    </section>
  );
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
