import { expect, test } from "bun:test";
import { renderRoot } from "./render.js";

test("renderRoot escapes content and exposes listbox semantics", () => {
  const html = renderRoot(
    [
      {
        id: "x",
        title: "<script>",
        subtitle: '"quoted"',
        icon: "&",
        accessory: "Command",
        extension: "x",
        command: "x",
      },
    ],
    0,
    "<q>",
  );
  expect(html).toContain('role="listbox"');
  expect(html).toContain('role="option"');
  expect(html).not.toContain("<script>");
  expect(html).toContain("&lt;script&gt;");
});
