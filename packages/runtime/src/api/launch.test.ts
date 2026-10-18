import { expect, test } from "bun:test";
import { setCapabilityRequester } from "./capability.ts";
import { launchCommand, LaunchType, updateCommandMetadata } from "./launch.ts";

type Request = { name: string; params: Record<string, unknown> };

function requester(answer: (request: Request) => unknown) {
  const requests: Request[] = [];
  setCapabilityRequester((name, params) => {
    const request = { name, params };
    requests.push(request);
    return Promise.resolve(answer(request) as never);
  });
  return requests;
}

// @covers launchCommand
test("launchCommand asks the host for command.launch and resolves on a grant", async () => {
  const requests = requester(() => null);
  try {
    await launchCommand({ name: "list", type: LaunchType.UserInitiated });
    expect(requests).toEqual([
      { name: "command.launch", params: { name: "list", type: "userInitiated" } },
    ]);
    await launchCommand({
      name: "other",
      type: LaunchType.Background,
      extensionName: "clipboard-history",
      ownerOrAuthorName: "raycast",
      arguments: { query: "raycast" },
      context: { from: "test" },
      fallbackText: "fallback",
    });
    expect(requests[1]).toEqual({
      name: "command.launch",
      params: {
        name: "other",
        type: "background",
        extensionName: "clipboard-history",
        ownerOrAuthorName: "raycast",
        arguments: { query: "raycast" },
        context: { from: "test" },
        fallbackText: "fallback",
      },
    });
    // Absent optional fields stay absent on the wire, never `null`.
    expect(Object.keys(requests[0]!.params)).toEqual(["name", "type"]);
  } finally {
    setCapabilityRequester(undefined);
  }
});

// @covers launchCommand
test("launchCommand rejects with the host's denial", async () => {
  const requests = requester(() => {
    throw Object.assign(new Error("Capability denied: command.launch"), { code: "denied" });
  });
  try {
    await expect(launchCommand({ name: "list", type: LaunchType.UserInitiated })).rejects.toThrow(
      "Capability denied: command.launch",
    );
    expect(requests).toHaveLength(1);
  } finally {
    setCapabilityRequester(undefined);
  }
});

// @covers updateCommandMetadata
test("updateCommandMetadata sends subtitle updates, null clearing and omitted fields", async () => {
  const requests = requester(() => null);
  try {
    await updateCommandMetadata({ subtitle: "Current thing" });
    await updateCommandMetadata({ subtitle: null });
    await updateCommandMetadata({});
    expect(requests).toEqual([
      { name: "command.metadata", params: { subtitle: "Current thing" } },
      { name: "command.metadata", params: { subtitle: null } },
      { name: "command.metadata", params: {} },
    ]);
  } finally {
    setCapabilityRequester(undefined);
  }
});

// @covers updateCommandMetadata
test("updateCommandMetadata surfaces host rejection", async () => {
  requester(() => {
    throw new Error("metadata denied");
  });
  try {
    await expect(updateCommandMetadata({ subtitle: "No" })).rejects.toThrow("metadata denied");
  } finally {
    setCapabilityRequester(undefined);
  }
});
