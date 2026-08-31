import path from "node:path";

export interface V2DaemonConfiguration {
  readonly catalogRoot: string;
  readonly bootstrapPath: string;
  readonly socketPath: string;
  readonly nodeExecutable?: string;
}

export type V2DaemonConfigurationErrorCode = "configuration_incomplete" | "path_not_absolute";

export class V2DaemonConfigurationError extends Error {
  readonly code: V2DaemonConfigurationErrorCode;
  readonly variable?: string;
  readonly value?: string;

  constructor(code: V2DaemonConfigurationErrorCode, message: string, variable?: string, value?: string) {
    super(message);
    this.name = "V2DaemonConfigurationError";
    this.code = code;
    if (variable !== undefined) {
      this.variable = variable;
    }
    if (value !== undefined) {
      this.value = value;
    }
  }
}

const REQUIRED_VARIABLES = [
  ["BLAST_V2_CATALOG_ROOT", "catalogRoot"],
  ["BLAST_V2_BOOTSTRAP_PATH", "bootstrapPath"],
  ["BLAST_V2_SOCKET_PATH", "socketPath"],
] as const;

/**
 * Reads the explicit app-owned daemon mode without resolving or inventing any
 * filesystem paths. Returning undefined preserves the external-socket mode
 * when only its socket variable is present, as well as the legacy V1 mode when
 * no V2 configuration is present.
 */
export function readV2DaemonConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): V2DaemonConfiguration | undefined {
  const appOwnedPathConfigured =
    hasValue(environment.BLAST_V2_CATALOG_ROOT) || hasValue(environment.BLAST_V2_BOOTSTRAP_PATH);
  if (!appOwnedPathConfigured) {
    return undefined;
  }

  const catalogRoot = requireAbsolutePath(environment.BLAST_V2_CATALOG_ROOT, "BLAST_V2_CATALOG_ROOT");
  const bootstrapPath = requireAbsolutePath(environment.BLAST_V2_BOOTSTRAP_PATH, "BLAST_V2_BOOTSTRAP_PATH");
  const socketPath = requireAbsolutePath(environment.BLAST_V2_SOCKET_PATH, "BLAST_V2_SOCKET_PATH");

  const nodeExecutable = environment.BLAST_V2_NODE_EXECUTABLE;
  if (hasValue(nodeExecutable) && !path.isAbsolute(nodeExecutable)) {
    throw new V2DaemonConfigurationError(
      "path_not_absolute",
      "BLAST_V2_NODE_EXECUTABLE must be an absolute path",
      "BLAST_V2_NODE_EXECUTABLE",
      nodeExecutable,
    );
  }

  return {
    catalogRoot,
    bootstrapPath,
    socketPath,
    ...(hasValue(nodeExecutable) ? { nodeExecutable } : {}),
  };
}

function requireAbsolutePath(value: string | undefined, variable: string): string {
  if (!hasValue(value)) {
    throw new V2DaemonConfigurationError(
      "configuration_incomplete",
      `V2 daemon configuration requires ${REQUIRED_VARIABLES.map(([name]) => name).join(", ")}`,
      variable,
      value,
    );
  }
  if (!path.isAbsolute(value)) {
    throw new V2DaemonConfigurationError("path_not_absolute", `${variable} must be an absolute path`, variable, value);
  }
  return value;
}

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}
