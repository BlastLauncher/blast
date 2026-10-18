import assert from "node:assert/strict";
import test from "node:test";

const { applyV2ToastPayload, createV2ToastState, expireV2Toast, getV2ToastTimeoutMs } =
  await import("../dist/renderer/v2ToastModel.js");

test("uses bounded style timeouts while preserving interactive and animated toasts", () => {
  assert.equal(getV2ToastTimeoutMs({ style: "neutral" }), 4_000);
  assert.equal(getV2ToastTimeoutMs({ style: "success" }), 4_000);
  assert.equal(getV2ToastTimeoutMs({ style: "failure" }), 6_000);
  assert.equal(getV2ToastTimeoutMs({ style: "animated" }), undefined);
  assert.equal(
    getV2ToastTimeoutMs({
      style: "success",
      primaryAction: { title: "Undo", eventId: "undo" },
    }),
    undefined,
  );
});

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

test("expires only the captured toast and allows a later update to reappear", () => {
  let state = createV2ToastState();
  state = applyV2ToastPayload(state, { toastId: "toast-1", title: "Working", style: "animated" });
  state = applyV2ToastPayload(state, { toastId: "toast-2", title: "Saved", style: "success" });
  const firstToast = state.items[0];
  assert.ok(firstToast);

  const expired = expireV2Toast(state, firstToast);
  assert.deepEqual(
    expired.items.map((toast) => toast.toastId),
    ["toast-2"],
  );
  assert.strictEqual(expireV2Toast(expired, firstToast), expired, "stale expiry must not remove a replacement");

  const updated = applyV2ToastPayload(expired, {
    toastId: "toast-1",
    operation: "update",
    title: "Finished",
    style: "success",
  });
  assert.deepEqual(
    updated.items.map((toast) => [toast.toastId, toast.title]),
    [
      ["toast-2", "Saved"],
      ["toast-1", "Finished"],
    ],
  );
});
