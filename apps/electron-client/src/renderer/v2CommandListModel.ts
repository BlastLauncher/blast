import type { CoreCommandDescriptor } from "@blastlauncher/core";

export type V2CommandSelectionDirection = "next" | "previous";

/** Human-readable source label for the host-assigned chooser provenance. */
export function describeV2CommandSource(sourceKind: CoreCommandDescriptor["sourceKind"]): string | undefined {
  switch (sourceKind) {
    case "local":
      return "Local development";
    case "raycast-curated":
      return "Raycast-curated";
    case "external":
      return "Unreviewed external";
    default:
      return undefined;
  }
}

/** Returns the path-free commands matching the chooser query. */
export function filterV2Commands(
  commands: readonly CoreCommandDescriptor[],
  query: string,
): readonly CoreCommandDescriptor[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (normalizedQuery.length === 0) {
    return commands;
  }

  return commands.filter((command) =>
    [
      command.title,
      command.extensionName,
      command.extensionId,
      command.commandName,
      describeV2CommandSource(command.sourceKind),
    ]
      .filter((value): value is string => value !== undefined)
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
  );
}

/** Keeps a chooser selection valid when its command list changes. */
export function clampV2CommandSelection(index: number, commandCount: number): number {
  if (commandCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, commandCount - 1));
}

/** Moves the chooser selection and wraps at either list edge. */
export function moveV2CommandSelection(
  index: number,
  direction: V2CommandSelectionDirection,
  commandCount: number,
): number {
  if (commandCount <= 0) {
    return 0;
  }
  const current = clampV2CommandSelection(index, commandCount);
  if (direction === "next") {
    return (current + 1) % commandCount;
  }
  return (current - 1 + commandCount) % commandCount;
}
