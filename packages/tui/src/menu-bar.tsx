/** @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core";
import type { MenuRowView } from "@blastlauncher/client-core";
import { theme } from "./theme.ts";

export function MenuBarView({ rows }: { rows: MenuRowView[] }) {
  return (
    <>
      {rows.map((row) => {
        const isSelected = row.selected;
        if (row.kind === "section") {
          return (
            <box key={row.id} id={row.id} height={1} flexShrink={0} width="100%">
              <text flexGrow={1} fg={theme.colors.textMuted} attributes={TextAttributes.BOLD}>
                {row.title}
              </text>
            </box>
          );
        }
        return (
          <box
            key={row.id}
            id={row.id}
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
              {row.title}
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
            {row.kind === "submenu" ? (
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
