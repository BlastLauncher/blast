/** @jsxImportSource @opentui/react */
import type { ControllerView } from "@blastlauncher/client-core";
import { iconTint, theme } from "./theme.ts";

/**
 * The quiet centre of an empty List or Grid: a scene's EmptyView when it has
 * one, else the "No results" line every filtered launcher shows.
 */
export function EmptyState({
  empty,
  emptyText,
}: {
  empty: ControllerView["empty"];
  emptyText: string;
}) {
  if (!empty)
    return (
      <text flexShrink={0} fg={theme.colors.textMuted}>
        {emptyText || "No results"}
      </text>
    );
  return (
    <box flexDirection="column" alignItems="center" paddingTop={1} flexShrink={0}>
      {empty.iconLabel ? (
        <text flexShrink={0} fg={iconTint(empty.iconTint)}>
          {empty.iconLabel}
        </text>
      ) : null}
      <text flexShrink={0} fg={theme.colors.text}>
        {empty.title || emptyText || "No results"}
      </text>
      {empty.description ? (
        <text flexShrink={0} fg={theme.colors.textMuted}>
          {empty.description}
        </text>
      ) : null}
    </box>
  );
}
