export default function nodeBuiltinsProbe() {
  const path = require("node:path") as { join: (...parts: string[]) => string };
  const crypto = require("node:crypto") as {
    createHash: (algorithm: string) => {
      update: (value: string) => unknown;
      digest: (encoding: string) => string;
    };
  };
  const hash = crypto.createHash("sha256").update("blast").digest("hex");
  return { joined: path.join("blast", "browser"), hash, buffer: Buffer.from("ok").toString("hex") };
}
