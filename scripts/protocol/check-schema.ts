// The checked-in schema must regenerate byte-identical from the schema source.
import { checkSchema } from "./schema.ts";

try {
  const errors = checkSchema(process.cwd());
  for (const error of errors) console.error(`protocol: ${error}`);
  if (errors.length) process.exit(1);
  console.log("protocol: ok");
} catch (error) {
  console.error(`protocol: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
