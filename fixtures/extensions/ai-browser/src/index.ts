import { AI, BrowserExtension, environment } from "@raycast/api";

export default async function command() {
  console.log(`access:${environment.canAccess(AI)}:${environment.canAccess(BrowserExtension)}`);
  try {
    const stream = AI.ask("question");
    stream.on("data", (chunk) => console.log(`chunk:${chunk}`));
    console.log(`answer:${await stream}`);
  } catch (error) {
    console.log(`ai:${(error as Error).message}`);
  }
  try {
    console.log(`tabs:${JSON.stringify(await BrowserExtension.getTabs())}`);
    console.log(`active:${await BrowserExtension.getContent()}`);
    console.log(`specific:${await BrowserExtension.getContent({ tabId: 2, format: "text" })}`);
  } catch (error) {
    console.log(`browser:${(error as Error).message}`);
  }
}
