import { showToast, showHUD, closeMainWindow } from "@raycast/api";

console.log("loaded once");
export default async function Command() {
  console.log("called once");
  const toast = await showToast({ title: "Async view toast" });
  await toast.hide();
  await toast.show();
  await showHUD("Async view done");
  await closeMainWindow();
}
