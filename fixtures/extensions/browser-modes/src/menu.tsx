import { MenuBarExtra } from "@raycast/api";
import { useState } from "react";

// The counter makes activation observable: activating the item re-renders the
// menu, which the browser client shows without a HUD slot of its own.
export default function menu() {
  const [clicks, setClicks] = useState(0);
  return (
    <MenuBarExtra title="Modes">
      <MenuBarExtra.Section title="Actions">
        <MenuBarExtra.Submenu title="More">
          <MenuBarExtra.Item
            title={`Clicks: ${clicks}`}
            onAction={() => setClicks((count) => count + 1)}
          />
        </MenuBarExtra.Submenu>
      </MenuBarExtra.Section>
    </MenuBarExtra>
  );
}
