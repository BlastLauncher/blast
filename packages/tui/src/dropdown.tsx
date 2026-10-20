/** @jsxImportSource @opentui/react */
import type { ControllerView } from "@blastlauncher/client-core";
import { theme } from "./theme.ts";
import { TextAttributes } from "@opentui/core";

export function DropdownPanel({
  dropdown,
  onQuery,
}: {
  dropdown: NonNullable<ControllerView["dropdown"]>;
  onQuery: (value: string) => void;
}) {
  const { options, query } = dropdown;
  const headers = new Set(options.map((option) => option.section).filter(Boolean)).size;
  let lastSection: string | undefined;
  return (
    <box
      position="absolute"
      bottom={1}
      right={1}
      zIndex={10}
      width={36}
      flexDirection="column"
      borderStyle="rounded"
      borderColor={theme.colors.border}
      backgroundColor={theme.colors.panel}
      flexShrink={0}
      height={Math.min(options.length + headers + 3, 14)}
      title={dropdown.tooltip || "Dropdown"}
    >
      <input
        focused
        value={query}
        placeholder="Filter options…"
        placeholderColor={theme.colors.textMuted}
        textColor={theme.colors.text}
        backgroundColor={theme.colors.panel}
        focusedBackgroundColor={theme.colors.panel}
        onInput={onQuery}
      />
      <scrollbox flexGrow={1}>
        {options.flatMap((option) => {
          const rows = [];
          if (option.section !== lastSection) {
            lastSection = option.section;
            if (option.section)
              rows.push(
                <text
                  key={`section-${option.section}`}
                  height={1}
                  flexShrink={0}
                  fg={theme.colors.textMuted}
                  attributes={TextAttributes.BOLD}
                >
                  {option.section}
                </text>,
              );
          }
          const isChosen = option.selected;
          rows.push(
            <text
              key={option.value}
              height={1}
              flexShrink={0}
              wrapMode="none"
              fg={isChosen ? theme.colors.selectionFg : theme.colors.text}
              {...(isChosen ? { bg: theme.colors.selectionBg } : {})}
            >
              {isChosen ? "› " : "  "}
              {option.title}
            </text>,
          );
          return rows;
        })}
      </scrollbox>
    </box>
  );
}
