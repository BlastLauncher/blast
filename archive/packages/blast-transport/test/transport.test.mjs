import { createMessage } from "@blastlauncher/protocol";
import { defineTransportConformanceSuite } from "@blastlauncher/transport-test-suite";

import { createInMemoryTransportPair } from "../dist/index.js";

defineTransportConformanceSuite("in-memory transport", createInMemoryTransportPair, [
  createMessage("1", "test", { position: 1 }),
  createMessage("2", "test", { position: 2 }),
]);
