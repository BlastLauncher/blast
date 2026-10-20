import { expect, test } from "bun:test";
import { createBroker } from "@blastlauncher/host";
import { createHeadlessHandlers } from "./headless.ts";

test("bare and headless brokers deny OAuth unless an authorization code is supplied", async () => {
  const request = {
    type: "capability.request",
    id: "oauth",
    name: "oauth.authorize",
    params: { url: "https://provider.example" },
  } as const;
  for (const handlers of [{}, createHeadlessHandlers()]) {
    expect(await createBroker(handlers)(request)).toMatchObject({
      ok: false,
      error: { code: "denied" },
    });
  }
  expect(await createBroker(createHeadlessHandlers({ oauthCode: "code" }))(request)).toMatchObject({
    ok: true,
    value: { authorizationCode: "code" },
  });
});
