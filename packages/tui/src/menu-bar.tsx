/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import type { MenuRow } from "@blastlauncher/client-core";
import { theme } from "./theme.ts";

export function MenuBarView({ rows, selectedId }: { rows: MenuRow[]; selectedId: string | null }) {
  return (
    <>
      {rows.map((row) => {
        const isSelected = row.node.id === selectedId;
        if (!row.item) {
          return (
            <box key={row.node.id} id={row.node.id} height={1} flexShrink={0} width="100%">
              <text flexGrow={1} fg={theme.colors.textMuted} attributes={TextAttributes.BOLD}>
                {row.title ?? row.text}
              </text>
            </box>
          );
        }
        return (
          <box
            key={row.node.id}
            id={row.node.id}
            flexDirection="row"
            width="100%"
            height={1}
            flexShrink={0}
            {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
          >
            <text
              flexShrink={0}
              wrapMode="none"
              fg={row.disabled ? theme.colors.textMuted : theme.colors.accent}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            >
              {isSelected ? `${theme.glyphs.pointer} ` : "  "}
            </text>
            <text
              flexShrink={0}
              wrapMode="none"
              fg={row.disabled ? theme.colors.textMuted : theme.colors.text}
              {...(isSelected ? { attributes: TextAttributes.BOLD } : {})}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            >
              {row.title ?? row.text}
            </text>
            {row.subtitle ? (
              <text
                flexShrink={1}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {`  ${row.subtitle}`}
              </text>
            ) : null}
            <box
              flexGrow={1}
              flexShrink={0}
              {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
            />
            {row.isSubmenu ? (
              <text
                flexShrink={0}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {row.shortcut ? `${row.shortcut}  ${theme.glyphs.pointer}` : theme.glyphs.pointer}
              </text>
            ) : row.shortcut ? (
              <text
                flexShrink={0}
                wrapMode="none"
                fg={theme.colors.textMuted}
                {...(isSelected ? { backgroundColor: theme.colors.selectionBg } : {})}
              >
                {row.shortcut}
              </text>
            ) : null}
          </box>
        );
      })}
      {rows.length === 0 && (
        <text flexShrink={0} fg={theme.colors.textMuted}>
          No menu items
        </text>
      )}
    </>
  );
}
