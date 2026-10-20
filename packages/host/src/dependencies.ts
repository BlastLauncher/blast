/** Optional fallback supplied by @blastlauncher/shared-deps. */
export type SharedDependencies = {
  resolveShared(specifier: string, kind?: "import" | "require"): string | undefined;
  dependencyWarnings(declarations?: Record<string, unknown>): string[];
};
export type SharedDependencyLoader = () => Promise<SharedDependencies>;

export async function loadSharedDependencies(
  load: SharedDependencyLoader = () => import("@blastlauncher/shared-deps"),
): Promise<SharedDependencies | undefined> {
  try {
    return await load();
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND" &&
      /Cannot find (?:package|module) ['"]@blastlauncher\/shared-deps['"]/.test(
        (error as Error).message,
      )
    )
      return undefined;
    throw error;
  }
}
