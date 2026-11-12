import { MenuBarExtra, showHUD } from "@raycast/api";
import { useState } from "react";

export default function Command() {
  const [cups, setCups] = useState(0);
  return (
    <MenuBarExtra title={`☕ ${cups}`} tooltip="Coffee counter">
      <MenuBarExtra.Section title="Today">
        <MenuBarExtra.Item title={`Cups: ${cups}`} onAction={() => setCups((count) => count + 1)} />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section title="More">
        <MenuBarExtra.Submenu title="Reset">
          <MenuBarExtra.Item title="Start Over" onAction={() => setCups(0)} />
        </MenuBarExtra.Submenu>
        <MenuBarExtra.Item
          title="Say Hello"
          onAction={() => void showHUD("Hello from the menu bar")}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
