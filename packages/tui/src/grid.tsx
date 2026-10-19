/** @jsxImportSource @opentui/react */
import type { SceneNode } from "@blastlauncher/protocol";
import { contentGlyph, type GridLayout } from "./grid.ts";
import { selectionId, text } from "./nodes.ts";

export function cellText(node: SceneNode): string {
  return [text(node.props.title), text(node.props.subtitle)].filter(Boolean).join("  ");
}

export function GridView({
  layout,
  selectedId,
  emptyText,
}: {
  layout: GridLayout;
  selectedId: string | null;
  emptyText: string;
}) {
  return (
    <>
      {layout.rows.map((row, index) =>
        row.cells.length === 0 ? (
          <text key={`header-${index}`} height={1} flexShrink={0}>
            {row.header}
          </text>
        ) : (
          <box key={`row-${index}`} flexDirection="row" flexShrink={0}>
            {row.cells.map((cell) => {
              const selected = selectionId(cell) === selectedId;
              return (
                <text
                  key={cell.id}
                  id={cell.id}
                  height={2}
                  flexGrow={1}
                  flexShrink={1}
                  {...(selected ? { bg: "#234567" } : {})}
                >
                  {`${contentGlyph(cell)}\n${cellText(cell)}`}
                </text>
              );
            })}
          </box>
        ),
      )}
      {layout.rows.length === 0 && <text flexShrink={0}>{emptyText}</text>}
    </>
  );
}
