export default async function Command() {
  await Promise.resolve();
  throw new Error("no-view failed");
}
