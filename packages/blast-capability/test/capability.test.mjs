import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_REQUEST_MESSAGE,
  CAPABILITY_RESPONSE_MESSAGE,
  CapabilityBroker,
  createGrantListPolicy,
  denyAllPolicy,
  validateCapabilityRequestMessage,
  validateCapabilityRequestPayload,
  validateCapabilityResponseMessage,
  validateCapabilityResponsePayload,
} from "../dist/index.js";

const PROTOCOL_VERSION = 1;

function envelope(type, payload, id = "message-1") {
  return { protocolVersion: PROTOCOL_VERSION, id, type, payload };
}

function writeRequest(overrides = {}) {
  return {
    requestId: "request-1",
    extensionId: "sample.extension",
    commandName: "index",
    capability: "clipboard",
    operation: "write",
    arguments: { text: "hello" },
    ...overrides,
  };
}

test("validates capability request messages", (context) => {
  context.test("accepts a well-formed request", () => {
    assert.equal(validateCapabilityRequestMessage(envelope(CAPABILITY_REQUEST_MESSAGE, writeRequest())).ok, true);
  });

  context.test("rejects wrong types and missing fields", () => {
    assert.equal(validateCapabilityRequestMessage({}).ok, false);
    const result = validateCapabilityRequestPayload({ requestId: "request-1", capability: "clipboard" });
    assert.deepEqual(result.issues?.map((issue) => issue.path).toSorted(), [
      "$.commandName",
      "$.extensionId",
      "$.operation",
    ]);
  });

  context.test("rejects non-primitive arguments", () => {
    const result = validateCapabilityRequestPayload(writeRequest({ arguments: { text: { nested: true } } }));
    assert.deepEqual(
      result.issues?.map((issue) => issue.path),
      ["$.arguments.text"],
    );
  });

  context.test("allows omitted arguments", () => {
    assert.equal(validateCapabilityRequestPayload(writeRequest({ arguments: undefined })).ok, true);
  });
});

test("validates capability response messages", (context) => {
  context.test("accepts a succeeded response", () => {
    assert.equal(
      validateCapabilityResponseMessage(
        envelope(CAPABILITY_RESPONSE_MESSAGE, { requestId: "request-1", outcome: "succeeded", value: "text" }),
      ).ok,
      true,
    );
  });

  context.test("requires a code for denied and failed outcomes", () => {
    for (const outcome of ["denied", "failed"]) {
      const result = validateCapabilityResponsePayload({ requestId: "request-1", outcome });
      assert.deepEqual(
        result.issues?.map((issue) => issue.path),
        ["$.code"],
      );
    }
  });

  context.test("rejects unknown outcomes and non-primitive values", () => {
    assert.deepEqual(
      validateCapabilityResponsePayload({ requestId: "request-1", outcome: "maybe" }).issues?.map(
        (issue) => issue.path,
      ),
      ["$.outcome"],
    );
    assert.deepEqual(
      validateCapabilityResponsePayload({
        requestId: "request-1",
        outcome: "succeeded",
        value: { nested: true },
      }).issues?.map((issue) => issue.path),
      ["$.value"],
    );
  });
});

test("the broker executes granted requests through providers", async () => {
  const performed = [];
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([{ extensionId: "sample.extension", capability: "clipboard", operation: "write" }]),
    providers: {
      clipboard: {
        async perform(request) {
          performed.push(request);
          return null;
        },
      },
    },
  });

  const response = await broker.execute(writeRequest());
  assert.deepEqual(response, { requestId: "request-1", outcome: "succeeded", value: null });
  assert.deepEqual(
    performed.map((request) => request.arguments),
    [{ text: "hello" }],
  );
});

test("the broker denies by default", async (context) => {
  const providerCalls = [];
  const broker = new CapabilityBroker({
    providers: {
      clipboard: {
        async perform(request) {
          providerCalls.push(request);
          return null;
        },
      },
    },
  });

  await context.test("without a policy", async () => {
    const response = await broker.execute(writeRequest());
    assert.equal(response.outcome, "denied");
    assert.equal(response.code, "capability_denied");
  });

  await context.test("for ungranted operations", async () => {
    const restrictive = new CapabilityBroker({
      policy: createGrantListPolicy([{ extensionId: "other.extension", capability: "clipboard", operation: "write" }]),
      providers: {
        clipboard: {
          async perform() {
            return null;
          },
        },
      },
    });
    const response = await restrictive.execute(writeRequest());
    assert.equal(response.outcome, "denied");
    assert.equal(response.code, "capability_denied");
  });

  await context.test("for unknown capabilities", async () => {
    const response = await broker.execute(writeRequest({ capability: "filesystem" }));
    assert.equal(response.outcome, "denied");
    assert.equal(response.code, "unknown_capability");
  });

  await context.test("without consulting the provider", () => {
    assert.deepEqual(providerCalls, []);
  });

  await context.test("with the explicit deny-all policy", async () => {
    const response = await new CapabilityBroker({ policy: denyAllPolicy, providers: {} }).execute(writeRequest());
    assert.equal(response.outcome, "denied");
  });
});

test("the broker reports provider failures as structured responses", async () => {
  const broker = new CapabilityBroker({
    policy: createGrantListPolicy([{ extensionId: "sample.extension", capability: "clipboard", operation: "read" }]),
    providers: {
      clipboard: {
        async perform() {
          throw new Error("clipboard is unavailable");
        },
      },
    },
  });

  const response = await broker.execute(writeRequest({ operation: "read", arguments: undefined }));
  assert.deepEqual(response, {
    requestId: "request-1",
    outcome: "failed",
    code: "capability_failed",
    message: "clipboard is unavailable",
  });
});

test("grant policies evaluate the full request identity", async () => {
  const policy = createGrantListPolicy([
    { extensionId: "sample.extension", capability: "clipboard", operation: "write" },
  ]);
  const allowed = await policy.decide(writeRequest());
  const deniedIdentity = await policy.decide(writeRequest({ extensionId: "other.extension" }));
  const deniedOperation = await policy.decide(writeRequest({ operation: "read" }));
  const perExtension = await policy.decide(writeRequest({ commandName: "other" }));

  assert.equal(allowed, "allow");
  assert.equal(deniedIdentity, "deny");
  assert.equal(deniedOperation, "deny");
  assert.equal(perExtension, "allow");
});

test("the in-memory local-storage provider namespaces per extension", async () => {
  const { createInMemoryLocalStorageProvider } = await import("../dist/index.js");
  const provider = createInMemoryLocalStorageProvider();
  const base = { commandName: "index", capability: "local-storage", requestId: "r" };

  assert.equal(
    await provider.perform({ ...base, extensionId: "a", operation: "get", arguments: { key: "k" } }),
    undefined,
  );
  await provider.perform({ ...base, extensionId: "a", operation: "set", arguments: { key: "k", value: "va" } });
  await provider.perform({ ...base, extensionId: "b", operation: "set", arguments: { key: "k", value: "vb" } });

  assert.equal(await provider.perform({ ...base, extensionId: "a", operation: "get", arguments: { key: "k" } }), "va");
  assert.equal(await provider.perform({ ...base, extensionId: "b", operation: "get", arguments: { key: "k" } }), "vb");
  assert.deepEqual(
    JSON.parse(await provider.perform({ ...base, extensionId: "a", operation: "getAll", arguments: {} })),
    { k: "va" },
  );
  assert.deepEqual(
    JSON.parse(await provider.perform({ ...base, extensionId: "b", operation: "getAll", arguments: {} })),
    { k: "vb" },
  );

  await provider.perform({ ...base, extensionId: "a", operation: "remove", arguments: { key: "k" } });
  assert.equal(
    await provider.perform({ ...base, extensionId: "a", operation: "get", arguments: { key: "k" } }),
    undefined,
  );
  assert.deepEqual(
    JSON.parse(await provider.perform({ ...base, extensionId: "a", operation: "getAll", arguments: {} })),
    {},
  );
  assert.equal(await provider.perform({ ...base, extensionId: "b", operation: "get", arguments: { key: "k" } }), "vb");

  await provider.perform({ ...base, extensionId: "b", operation: "clear" });
  assert.equal(
    await provider.perform({ ...base, extensionId: "b", operation: "get", arguments: { key: "k" } }),
    undefined,
  );

  await assert.rejects(
    () =>
      provider.perform({
        ...base,
        extensionId: "a",
        operation: "set",
        arguments: { key: "k", value: { nested: true } },
      }),
    /primitive value/,
  );
});
