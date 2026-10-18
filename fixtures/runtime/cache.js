import { Cache, environment } from "@raycast/api";
import { existsSync } from "node:fs";

export default function Command() {
  const cache = new Cache();
  const previous = cache.get("count") ?? "0";
  cache.set("count", String(Number(previous) + 1));
  console.log(
    JSON.stringify({
      previous,
      supportPath: environment.supportPath,
      exists: existsSync(environment.supportPath),
    }),
  );
}
