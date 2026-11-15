import { newWindow } from "./tmux.ts";

export default async function Command() {
  await newWindow(["-c", "#{pane_current_path}"]);
}
