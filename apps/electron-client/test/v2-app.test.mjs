import assert from "node:assert/strict";
import test from "node:test";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { V2CommandEmptyState, V2StartupFailure } = await import("../dist/renderer/V2AppStates.js");
const { V2CommandSourceBadge } = await import("../dist/renderer/V2CommandSource.js");

test("explains an empty V2 catalog and provides a refresh action", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2CommandEmptyState, {
      disabled: false,
      onRefresh: () => {},
      query: "",
    }),
  );

  assert.match(markup, /No V2 commands are available yet\./);
  assert.match(markup, /Add a compatible extension, then refresh the catalog\./);
  assert.match(markup, /Refresh catalog/);
  assert.match(markup, /role="status"/);
});

test("distinguishes an empty command search from an empty catalog", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2CommandEmptyState, {
      disabled: false,
      onRefresh: () => {},
      query: "missing",
    }),
  );

  assert.match(markup, /No commands match this search\./);
  assert.doesNotMatch(markup, /Refresh catalog/);
});

test("presents a retry action when the V2 client cannot start", () => {
  const markup = renderToStaticMarkup(
    React.createElement(V2StartupFailure, {
      disabled: false,
      onRetry: () => {},
    }),
  );

  assert.match(markup, /V2 client is unavailable\./);
  assert.match(markup, /The local core may still be starting\./);
  assert.match(markup, /Retry connection/);
  assert.match(markup, /role="status"/);
});

test("presents the source provenance label used by the command chooser", () => {
  const curatedMarkup = renderToStaticMarkup(
    React.createElement(V2CommandSourceBadge, { sourceKind: "raycast-curated" }),
  );
  const externalMarkup = renderToStaticMarkup(React.createElement(V2CommandSourceBadge, { sourceKind: "external" }));
  const absentMarkup = renderToStaticMarkup(React.createElement(V2CommandSourceBadge, { sourceKind: undefined }));

  assert.match(curatedMarkup, /Raycast-curated/);
  assert.match(curatedMarkup, /data-source-kind="raycast-curated"/);
  assert.match(externalMarkup, /Unreviewed external/);
  assert.doesNotMatch(absentMarkup, /source-kind|Local development|Raycast-curated|Unreviewed external/);
});
