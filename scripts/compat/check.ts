// The `compat:check` verify step: the inventory and the coverage report must
// both regenerate byte-identical, and every `@covers` tag must name a path the
// inventory knows, reported with file:line.
import { checkInventory } from "./generate-inventory.ts";
import { checkCoverage } from "./generate-coverage.ts";

try {
  const errors = [...checkInventory(process.cwd()), ...checkCoverage(process.cwd())];
  for (const error of errors) console.error(`compat: ${error}`);
  if (errors.length) process.exit(1);
  console.log("compat: ok");
} catch (error) {
  console.error(`compat: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
