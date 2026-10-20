import type { CapabilityHandler } from "./index.ts";
import { params, unsupported, type DesktopTools } from "./desktop.ts";
import {
  macSelectedText,
  macSelectedFiles,
  psSelectedText,
  psSelectedFiles,
} from "./desktop-scripts.ts";

export function selectionHandlers(t: DesktopTools): Record<string, CapabilityHandler> {
  // Serializing clipboard round trips prevents two selection requests from
  // restoring each other's temporary clipboard contents.
  let pending = Promise.resolve();
  return {
    "selection.text": (value) => {
      params(value);
      const result = pending.then(read);
      pending = result.then(
        () => {},
        () => {},
      );
      return result;
    },
    "selection.files": async (value) => {
      params(value);
      if (t.platform === "darwin")
        return JSON.parse(await t.jxa("selection.files", macSelectedFiles));
      if (t.platform === "win32") return JSON.parse(await t.ps("selection.files", psSelectedFiles));
      return unsupported(t, "selection.files", "no portable file-manager selection API");
    },
  };
  async function read() {
    if (t.platform === "darwin")
      return JSON.parse(await t.jxa("selection.text", macSelectedText)) as string;
    if (t.platform === "win32") return t.ps("selection.text", psSelectedText);
    if (t.platform !== "linux") unsupported(t, "selection.text", "text selection is unavailable");
    if (t.env.WAYLAND_DISPLAY)
      return t.command("selection.text", "wl-paste", ["--primary", "--no-newline"]);
    if (!t.env.DISPLAY) unsupported(t, "selection.text", "a Wayland or X11 display is required");
    return t.command("selection.text", "xclip", ["-selection", "primary", "-o"]);
  }
}
