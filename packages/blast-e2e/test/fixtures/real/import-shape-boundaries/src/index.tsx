import * as Raycast from "@raycast/api";
import "@raycast/api";
import { useEffect, useState } from "react";

export default function Command() {
  const [dynamicImportReady, setDynamicImportReady] = useState(false);

  useEffect(() => {
    void import("@raycast/api").then(({ Icon }) => {
      setDynamicImportReady(Icon.Circle === Raycast.Icon.Circle);
    });
  }, []);

  return (
    <Raycast.List navigationTitle={dynamicImportReady ? "Import shapes:ready" : "Import shapes:loading"}>
      <Raycast.List.Item title="Namespace and dynamic imports" icon={Raycast.Icon.Circle} />
    </Raycast.List>
  );
}
