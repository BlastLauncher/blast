import { closeMainWindow, PopToRootType } from "@raycast/api";

// A no-view command closes the window before it does anything else, so the
// scene it publishes exists only because of the close request.
export default async function Command() {
  await closeMainWindow({ clearRootSearch: true, popToRootType: PopToRootType.Suspended });
}
