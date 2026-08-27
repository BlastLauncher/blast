import assert from "node:assert/strict";
import test from "node:test";

import { ExtensionHost } from "../dist/index.js";

const descriptor = {
  extensionId: "example.extension",
  commandName: "index",
  entrypoint: "/tmp/example/index.js",
  rootDirectory: "/tmp/example",
};

function createLauncher(stopped) {
  return {
    async launch() {
      return {
        connection: {
          messages: {
            async *[Symbol.asyncIterator]() {},
          },
          async send() {},
          async close() {},
        },
        async stop(reason) {
          stopped.push(reason);
        },
      };
    },
  };
}

test("tracks and stops an extension session", async () => {
  const stopped = [];
  const host = new ExtensionHost(createLauncher(stopped));

  await host.start(descriptor, new AbortController().signal);
  assert.equal(host.activeSessions.length, 1);

  await host.stop(descriptor.extensionId, descriptor.commandName, "test complete");
  assert.equal(host.activeSessions.length, 0);
  assert.deepEqual(stopped, ["test complete"]);
});

test("rejects duplicate extension sessions", async () => {
  const host = new ExtensionHost(createLauncher([]));
  const signal = new AbortController().signal;

  await host.start(descriptor, signal);
  await assert.rejects(() => host.start(descriptor, signal), /session already exists/);
});

test("reserves a session while its process is starting", async () => {
  let completeLaunch;
  const launcher = createLauncher([]);
  launcher.launch = () =>
    new Promise((resolve) => {
      completeLaunch = () => resolve(createLauncher([]).launch());
    });

  const host = new ExtensionHost(launcher);
  const signal = new AbortController().signal;
  const firstStart = host.start(descriptor, signal);

  await assert.rejects(() => host.start(descriptor, signal), /session already exists/);
  completeLaunch();
  await firstStart;
});
