import { AI } from "@raycast/api";

export default async function () {
  await AI.refreshModels();
  const pending = AI.ask("hello", { model: { id: "full" }, creativity: "medium" });
  pending.on("data", (text) => console.log(`chunk:${text}`));
  console.log(`answer:${await pending}`);
  try {
    await AI.ask("hello", { model: { id: "missing" } });
  } catch (error) {
    console.log(String(error));
  }
  const controller = new AbortController();
  const hanging = AI.ask("hang", { model: { id: "text" }, signal: controller.signal });
  hanging.on("data", () => controller.abort());
  try {
    await hanging;
  } catch (error) {
    console.log(`abort:${(error as Error).name}`);
  }
  await AI.refreshModels();
  try {
    const result = await AI.experimental_decide({
      state: { prompt: "urgent?" },
      questions: { urgent: { type: "noul", instructions: "urgent?" } },
    });
    console.log(`decide:${result.urgent.noul}`);
  } catch (error) {
    console.log(String(error));
  }
}
