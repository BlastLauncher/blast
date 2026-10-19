/** @jsxImportSource @opentui/react */
import { dropdownOptions, filterOptions } from "./dropdown.ts";
import { text } from "./nodes.ts";
import type { SceneNode } from "@blastlauncher/protocol";

export function DropdownPanel({
  dropdown,
  query,
  index,
  onQuery,
}: {
  dropdown: SceneNode;
  query: string;
  index: number;
  onQuery: (value: string) => void;
}) {
  const options = filterOptions(dropdownOptions(dropdown), query);
  const chosen = options[Math.min(index, options.length - 1)];
  const headers = new Set(options.map((option) => option.section).filter(Boolean)).size;
  let lastSection: string | undefined;
  return (
    <box
      flexDirection="column"
      border
      flexShrink={0}
      height={Math.min(options.length + headers + 3, 14)}
      title={text(dropdown.props.tooltip) || "Dropdown"}
    >
      <input focused value={query} placeholder="Filter options…" onInput={onQuery} />
      <scrollbox flexGrow={1}>
        {options.flatMap((option) => {
          const rows = [];
          if (option.section !== lastSection) {
            lastSection = option.section;
            if (option.section)
              rows.push(
                <text key={`section-${option.section}`} height={1} flexShrink={0}>
                  {option.section}
                </text>,
              );
          }
          rows.push(
            <text key={option.node.id} height={1} flexShrink={0}>
              {option.node.id === chosen?.node.id ? "› " : "  "}
              {option.title}
            </text>,
          );
          return rows;
        })}
      </scrollbox>
    </box>
  );
}
