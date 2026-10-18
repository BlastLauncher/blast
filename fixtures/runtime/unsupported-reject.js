import { getDefaultApplication } from "@raycast/api";
export default async function Command() {
  return getDefaultApplication("/tmp/report.pdf");
}
