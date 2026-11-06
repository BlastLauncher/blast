import { confirmAlert, showToast, showHUD } from "@raycast/api";

export default async function Command() {
  const result = await confirmAlert({ title: "Continue?" });
  await showToast({
    title: result ? "Confirmed" : "Dismissed",
    primaryAction: { title: "Finish", onAction: () => void showHUD("Finished") },
  });
  await showHUD("Finished");
}
