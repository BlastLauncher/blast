/** @jsxImportSource @opentui/react */
import type { ControllerView } from "@blastlauncher/client-core";
import { theme } from "./theme.ts";

export function GridView({
  rows,
  emptyText,
  empty,
}: {
  rows: NonNullable<ControllerView["grid"]>;
  emptyText: string;
  empty: ControllerView["empty"];
}) {
  const hasCells = rows.some((row) => row.cells.length > 0);
  return (
    <>
      {rows.map((row, index) =>
        row.cells.length === 0 ? (
          <text key={`header-${index}`} height={1} flexShrink={0} fg={theme.colors.textMuted}>
            {row.header}
          </text>
        ) : (
          <box key={`row-${index}`} flexDirection="row" flexShrink={0}>
            {row.cells.map((cell) => (
              <text
                key={cell.id}
                id={cell.id}
                height={2}
                flexGrow={1}
                flexShrink={1}
                {...(cell.selected ? { bg: theme.colors.selectionBg } : {})}
              >
                {`${cell.content}\n${[cell.title, cell.subtitle].filter(Boolean).join("  ")}`}
              </text>
            ))}
          </box>
        ),
      )}
      {!hasCells && empty ? (
        <box flexDirection="column" alignItems="center" paddingTop={2}>
          {empty.iconLabel ? <text fg={empty.iconColor ?? theme.colors.accent}>{empty.iconLabel}</text> : null}
          <text fg={theme.colors.text}>{empty.title || emptyText}</text>
          {empty.description ? <text fg={theme.colors.textMuted}>{empty.description}</text> : null}
        </box>
      ) : !hasCells ? (
        <text flexShrink={0} fg={theme.colors.textMuted}>
          {emptyText || "No results"}
        </text>
      ) : null}
    </>
  );
}
