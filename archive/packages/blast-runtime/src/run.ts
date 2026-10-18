#!/usr/bin/env node
import { program } from "commander";

import { run } from ".";

program
  .option("--host <host>", "Host to run the runtime", "localhost")
  .option("--port <port>", "Port to run the runtime", (value) => Number.parseInt(value, 10), 8763)
  .parse(process.argv);

const opts = program.opts();
run({
  host: opts.host,
  port: opts.port,
});
