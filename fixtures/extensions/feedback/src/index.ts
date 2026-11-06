import { confirmAlert, showToast, showHUD } from "@raycast/api";

export default async function Command() {
  const result = await confirmAlert({ title: "Continue?" });
  await showToast({ title: result ? "Confirmed" : "Dismissed" });
  await showHUD("Finished");
}
