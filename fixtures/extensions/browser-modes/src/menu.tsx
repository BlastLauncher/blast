import { MenuBarExtra, Toast, confirmAlert, showHUD, showToast } from "@raycast/api";
import { useState } from "react";

// Counters make activation observable: activating an item re-renders the menu,
// which the browser client shows. Two items under the second section make a
// pointer click have to skip a section header to hit the right one.
export default function menu() {
  const [clicks, setClicks] = useState(0);
  const [other, setOther] = useState(0);
  return (
    <MenuBarExtra title="Modes">
      <MenuBarExtra.Section title="Actions">
        <MenuBarExtra.Submenu title="More">
          <MenuBarExtra.Item title="Nested" onAction={() => setClicks((count) => count + 1)} />
        </MenuBarExtra.Submenu>
      </MenuBarExtra.Section>
      <MenuBarExtra.Section title="Direct">
        <MenuBarExtra.Item
          title={`Clicks: ${clicks}`}
          onAction={() => setClicks((count) => count + 1)}
        />
        <MenuBarExtra.Item
          title={`Other: ${other}`}
          onAction={() => setOther((count) => count + 1)}
        />
      </MenuBarExtra.Section>
      <MenuBarExtra.Section title="Feedback">
        <MenuBarExtra.Item title="Show HUD" onAction={() => void showHUD("Menu HUD")} />
        <MenuBarExtra.Item
          title="Failure toast"
          onAction={() =>
            void showToast({ title: "Menu toast", message: "failed", style: Toast.Style.Failure })
          }
        />
        <MenuBarExtra.Item
          title="Ask"
          onAction={() => void confirmAlert({ title: "Menu alert", message: "From the menu" })}
        />
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
