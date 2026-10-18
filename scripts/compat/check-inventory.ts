// Regeneration also validates the vendored source digest before parsing it.
import { checkInventory } from "./generate-inventory.ts";

try {
  const errors = checkInventory(process.cwd());
  for (const error of errors) console.error(`compat: ${error}`);
  if (errors.length) process.exit(1);
  console.log("compat: ok");
} catch (error) {
  console.error(`compat: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
