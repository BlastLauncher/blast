// Generated inventory, coverage, enums and stubs must regenerate byte-identical.
// Every `@covers` tag must name a known inventory path, reported with file:line.
import { checkInventory } from "./generate-inventory.ts";
import { checkCoverage } from "./generate-coverage.ts";
import { checkEnums } from "./generate-enums.ts";
import { checkStubs } from "./generate-stubs.ts";

try {
  const errors = [
    ...checkInventory(process.cwd()),
    ...checkCoverage(process.cwd()),
    ...checkStubs(process.cwd()),
    ...(await checkEnums(process.cwd())),
  ];
  for (const error of errors) console.error(`compat: ${error}`);
  if (errors.length) process.exit(1);
  console.log("compat: ok");
} catch (error) {
  console.error(`compat: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
