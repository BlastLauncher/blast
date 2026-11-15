import { targeted } from "./tmux.ts";

export default async function Command() {
  await targeted("switch-client", ["-p"]);
}
