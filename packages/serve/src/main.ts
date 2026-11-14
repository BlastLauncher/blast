// The `blast-serve` bin: `npx @blastlauncher/serve`. See serve.ts for the flags.
import { serve } from "./serve.ts";

process.exitCode = await serve(process.argv.slice(2));
