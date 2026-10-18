import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { V2ToastStack } = await import("../dist/renderer/V2ToastStack.js");

test("server-renders toast content, styles, actions, and shortcut labels", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2ToastStack, {
      disabled: false,
      onAction: () => {},
      onTimeout: () => {},
      toasts: [
        {
          toastId: "toast-success",
          title: "Saved",
          message: "Your changes are ready.",
          style: "success",
          primaryAction: {
            title: "Open",
            eventId: "open-result",
            shortcut: { modifiers: ["cmd"], key: "O" },
          },
          secondaryAction: { title: "Dismiss", eventId: "dismiss-result" },
        },
        { toastId: "toast-failure", title: "Failed", style: "failure" },
      ],
    }),
  );

  assert.match(markup, /aria-live="polite"/);
  assert.match(markup, /data-toast-id="toast-success"/);
  assert.match(markup, /data-toast-style="success"/);
  assert.match(markup, /border-emerald-400\/35/);
  assert.match(markup, /Saved/);
  assert.match(markup, /Your changes are ready\./);
  assert.match(markup, /Open/);
  assert.match(markup, /Dismiss/);
  assert.match(markup, /cmd \+ O/);
  assert.match(markup, /data-toast-style="failure"/);
});

test("does not render an empty toast region", () => {
  assert.equal(
    renderToStaticMarkup(
      React.createElement(V2ToastStack, { disabled: false, onAction: () => {}, onTimeout: () => {}, toasts: [] }),
    ),
    "",
  );
});
