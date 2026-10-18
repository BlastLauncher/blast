import { expect, test } from "bun:test";
import { mkdtemp, open, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createBroker } from "./broker.ts";
import { createHeadlessHandlers } from "./headless.ts";
import { createOAuthHandlers, oauthTokenFile } from "./oauth.ts";

test("OAuth stores are extension scoped, provider keyed, serialized and atomically replaced", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "blast-oauth-"));
  try {
    const options = { dataDir, extensionName: "../extension" };
    const file = oauthTokenFile(options);
    const a = createOAuthHandlers(options);
    const b = createOAuthHandlers(options);
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        (i % 2 ? a : b)["oauth.tokens.set"]!({
          providerId: `provider-${i}`,
          extensionName: "victim",
          tokens: { accessToken: `secret-${i}` },
        }),
      ),
    );
    const contents = JSON.parse(await readFile(file, "utf8"));
    expect(Object.keys(contents)).toHaveLength(12);
    expect(contents["provider-0"].updatedAt).toEqual(expect.any(String));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await readdir(dirname(file))).toEqual([file.split("/").at(-1)!]);
    const fresh = createOAuthHandlers(options);
    expect(await fresh["oauth.tokens.get"]!({ providerId: "provider-0" })).toMatchObject({
      accessToken: "secret-0",
    });
    expect(
      await createOAuthHandlers({ dataDir, extensionName: "victim" })["oauth.tokens.get"]!({
        providerId: "provider-0",
      }),
    ).toBeNull();
    await fresh["oauth.tokens.set"]!({
      providerId: "__proto__",
      tokens: { accessToken: "special" },
    });
    expect(await fresh["oauth.tokens.get"]!({ providerId: "__proto__" })).toMatchObject({
      accessToken: "special",
    });
    await fresh["oauth.tokens.remove"]!({ providerId: "provider-0" });
    expect(await a["oauth.tokens.get"]!({ providerId: "provider-0" })).toBeNull();
    const prior = await readFile(file, "utf8");
    await expect(
      a["oauth.tokens.set"]!({ providerId: "bad", tokens: { accessToken: 2 } }),
    ).rejects.toThrow("Invalid OAuth token set");
    expect(await readFile(file, "utf8")).toBe(prior);
    const oldFile = await open(file, "r");
    try {
      await a["oauth.tokens.set"]!({ providerId: "new", tokens: { accessToken: "replacement" } });
      expect(await oldFile.readFile("utf8")).toBe(prior);
      expect(await readFile(file, "utf8")).not.toBe(prior);
    } finally {
      await oldFile.close();
    }
    await writeFile(file, "corrupt secret");
    await expect(
      a["oauth.tokens.set"]!({ providerId: "x", tokens: { accessToken: "new" } }),
    ).rejects.toThrow("Cannot read OAuth token store");
    expect(await readFile(file, "utf8")).toBe("corrupt secret");
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});

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
