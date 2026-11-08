import { MenuBarExtra, showHUD } from "@raycast/api";

export default function menu() {
  return (
    <MenuBarExtra title="Modes">
      <MenuBarExtra.Section title="Actions">
        <MenuBarExtra.Submenu title="More">
          <MenuBarExtra.Item title="Finish" onAction={() => showHUD("Menu item")} />
        </MenuBarExtra.Submenu>
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
