import { showToast } from "@raycast/api";

export default function Command() {
  console.log("called once");
  return {
    // oxlint-disable-next-line unicorn/no-thenable -- Exercise non-Promise command returns.
    then(resolve, reject) {
      showToast({ title: "Thenable view" }).then(resolve, reject);
    },
  };
}
