#!/usr/bin/env node

import { runRaycastExtensionBootstrap } from "./index.js";

runRaycastExtensionBootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
