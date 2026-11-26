import { writeSchema } from "./schema.ts";

writeSchema(process.cwd());
console.log("protocol: wrote packages/protocol/schema/embedder-v2.schema.json");
