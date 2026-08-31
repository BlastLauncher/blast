import assert from "node:assert/strict";
import test from "node:test";

const { applyV2ToastPayload, createV2ToastState } = await import("../dist/renderer/v2ToastModel.js");

test("reconciles identified toasts and retains only the newest three entries", () => {
  let state = createV2ToastState();
  for (const [toastId, title] of [
    ["toast-1", "One"],
    ["toast-2", "Two"],
    ["toast-3", "Three"],
    ["toast-4", "Four"],
  ]) {
    state = applyV2ToastPayload(state, { toastId, title });
  }

  assert.deepEqual(
    state.items.map((toast) => [toast.toastId, toast.title]),
    [
      ["toast-2", "Two"],
      ["toast-3", "Three"],
      ["toast-4", "Four"],
    ],
  );
});

test("updates in place without duplicating and clears omitted optional fields", () => {
  let state = createV2ToastState();
  state = applyV2ToastPayload(state, {
    toastId: "toast-1",
    title: "Uploading",
    message: "Starting",
    style: "animated",
    primaryAction: { title: "Cancel", eventId: "cancel" },
  });
  state = applyV2ToastPayload(state, { toastId: "toast-2", title: "Other", style: "neutral" });
  state = applyV2ToastPayload(state, {
    toastId: "toast-1",
    operation: "update",
    title: "Uploaded",
    style: "success",
  });

  assert.deepEqual(state.items, [
    { toastId: "toast-1", title: "Uploaded", style: "success" },
    { toastId: "toast-2", title: "Other", style: "neutral" },
  ]);
});

test("handles anonymous shows and identified hides deterministically", () => {
  let state = createV2ToastState();
  state = applyV2ToastPayload(state, { title: "First" });
  state = applyV2ToastPayload(state, { title: "Second" });
  assert.deepEqual(
    state.items.map((toast) => toast.toastId),
    ["v2-anonymous-toast-1", "v2-anonymous-toast-2"],
  );

  state = applyV2ToastPayload(state, { operation: "hide", toastId: "v2-anonymous-toast-1" });
  assert.deepEqual(
    state.items.map((toast) => toast.title),
    ["Second"],
  );
  assert.strictEqual(
    applyV2ToastPayload(state, { operation: "hide", toastId: "missing" }),
    state,
    "unknown hides should not create a new state object",
  );
});
