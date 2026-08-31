import path from "node:path";

export interface V2DaemonConfiguration {
  readonly catalogRoot: string;
  readonly additionalCatalogRoots?: readonly string[];
  readonly bootstrapPath: string;
  readonly socketPath: string;
  readonly nodeExecutable?: string;
  readonly raycastApiPath?: string;
  readonly reactModulePath?: string;
}

export interface PackagedV2DaemonPathOptions {
  readonly userDirectory: string;
  readonly resourcesPath: string;
}

export type V2DaemonConfigurationErrorCode =
  | "configuration_conflict"
  | "configuration_incomplete"
  | "configuration_invalid"
  | "path_not_absolute";

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
 * Reads the app-owned daemon mode without resolving filesystem paths. When the
 * caller supplies packagedConfiguration, an otherwise unconfigured app uses
 * that configuration as its default. Returning undefined preserves
 * external-socket mode and the explicit legacy V1 mode.
 */
export function readV2DaemonConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
  packagedConfiguration?: V2DaemonConfiguration,
): V2DaemonConfiguration | undefined {
  const mode = hasValue(environment.BLAST_V2_MODE) ? environment.BLAST_V2_MODE : undefined;
  if (mode !== undefined && mode !== "packaged" && mode !== "legacy") {
    throw new V2DaemonConfigurationError(
      "configuration_invalid",
      "BLAST_V2_MODE must be packaged or legacy",
      "BLAST_V2_MODE",
      mode,
    );
  }

  if (mode === "legacy") {
    const conflictingVariable = [
      "BLAST_V2_CATALOG_ROOT",
      "BLAST_V2_BOOTSTRAP_PATH",
      "BLAST_V2_SOCKET_PATH",
      "BLAST_V2_NODE_EXECUTABLE",
      "BLAST_V2_RAYCAST_API_PATH",
      "BLAST_V2_REACT_MODULE_PATH",
    ].find((variable) => hasValue(environment[variable]));
    if (conflictingVariable !== undefined) {
      throw new V2DaemonConfigurationError(
        "configuration_conflict",
        `${conflictingVariable} cannot be used with BLAST_V2_MODE=legacy`,
        conflictingVariable,
        environment[conflictingVariable],
      );
    }
    return undefined;
  }

  const appOwnedPathConfigured =
    hasValue(environment.BLAST_V2_CATALOG_ROOT) || hasValue(environment.BLAST_V2_BOOTSTRAP_PATH);
  if (!appOwnedPathConfigured) {
    if (hasValue(environment.BLAST_V2_SOCKET_PATH)) {
      return undefined;
    }
    if (mode === "packaged" || packagedConfiguration !== undefined) {
      if (packagedConfiguration === undefined) {
        throw new V2DaemonConfigurationError(
          "configuration_incomplete",
          "Packaged V2 mode requires the app to provide packaged resource paths",
          "BLAST_V2_MODE",
          environment.BLAST_V2_MODE,
        );
      }
      return applyPackagedOverrides(environment, packagedConfiguration);
    }
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

  const raycastApiPath = readOptionalAbsolutePath(environment.BLAST_V2_RAYCAST_API_PATH, "BLAST_V2_RAYCAST_API_PATH");
  const reactModulePath = readOptionalAbsolutePath(
    environment.BLAST_V2_REACT_MODULE_PATH,
    "BLAST_V2_REACT_MODULE_PATH",
  );

  return {
    catalogRoot,
    bootstrapPath,
    socketPath,
    ...(hasValue(nodeExecutable) ? { nodeExecutable } : {}),
    ...(raycastApiPath === undefined ? {} : { raycastApiPath }),
    ...(reactModulePath === undefined ? {} : { reactModulePath }),
  };
}

function applyPackagedOverrides(
  environment: Readonly<Record<string, string | undefined>>,
  packagedConfiguration: V2DaemonConfiguration,
): V2DaemonConfiguration {
  const nodeExecutable = readOptionalAbsolutePath(environment.BLAST_V2_NODE_EXECUTABLE, "BLAST_V2_NODE_EXECUTABLE");
  const raycastApiPath = readOptionalAbsolutePath(environment.BLAST_V2_RAYCAST_API_PATH, "BLAST_V2_RAYCAST_API_PATH");
  const reactModulePath = readOptionalAbsolutePath(
    environment.BLAST_V2_REACT_MODULE_PATH,
    "BLAST_V2_REACT_MODULE_PATH",
  );

  return {
    ...packagedConfiguration,
    ...(nodeExecutable === undefined ? {} : { nodeExecutable }),
    ...(raycastApiPath === undefined ? {} : { raycastApiPath }),
    ...(reactModulePath === undefined ? {} : { reactModulePath }),
  };
}

export function createPackagedV2DaemonConfiguration(options: PackagedV2DaemonPathOptions): V2DaemonConfiguration {
  requireAbsolutePathOption(options.userDirectory, "userDirectory");
  requireAbsolutePathOption(options.resourcesPath, "resourcesPath");

  return {
    catalogRoot: path.join(options.userDirectory, "dev-extensions", "node_modules"),
    additionalCatalogRoots: [path.join(options.userDirectory, "extensions", "node_modules", "@blast-extensions")],
    bootstrapPath: path.join(options.resourcesPath, "v2-bootstrap.cjs"),
    socketPath: path.join(options.userDirectory, "v2", "core.sock"),
    raycastApiPath: path.join(options.resourcesPath, "v2-raycast-api.cjs"),
    reactModulePath: path.join(options.resourcesPath, "react"),
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

function readOptionalAbsolutePath(value: string | undefined, variable: string): string | undefined {
  if (!hasValue(value)) {
    return undefined;
  }
  return requireAbsolutePath(value, variable);
}

function requireAbsolutePathOption(value: string, option: string): void {
  if (!path.isAbsolute(value)) {
    throw new V2DaemonConfigurationError("path_not_absolute", `${option} must be an absolute path`, option, value);
  }
}

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}
