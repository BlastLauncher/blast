import * as Raycast from "@raycast/api";
import "@raycast/api";
import { useEffect, useState } from "react";

const requiredRaycast = require("@raycast/api") as typeof Raycast;

export default function Command() {
  const [dynamicImportReady, setDynamicImportReady] = useState(false);
  const requireImportReady = requiredRaycast.Icon.Circle === Raycast.Icon.Circle;

  useEffect(() => {
    void import("@raycast/api").then(({ Icon }) => {
      setDynamicImportReady(Icon.Circle === Raycast.Icon.Circle);
    });
  }, []);

  return (
    <Raycast.List
      navigationTitle={dynamicImportReady && requireImportReady ? "Import shapes:ready" : "Import shapes:loading"}
    >
      <Raycast.List.Item title="Namespace and dynamic imports" icon={Raycast.Icon.Circle} />
    </Raycast.List>
  );
}
