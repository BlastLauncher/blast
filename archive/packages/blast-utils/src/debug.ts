import debug from "debug";

export function createDebug(name?: string) {
  return debug(name || "blast");
}

export const defaultDebug = createDebug();
