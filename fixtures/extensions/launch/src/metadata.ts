import { updateCommandMetadata } from "@raycast/api";

export default async function Command() {
  await updateCommandMetadata({ subtitle: "Current thing" });
  await updateCommandMetadata({ subtitle: null });
  await updateCommandMetadata({});
}
