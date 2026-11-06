import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./render.js";

describe("renderMarkdown", () => {
  test("renders the safe subset and escapes HTML", () => {
    const html = renderMarkdown(
      "# Title\n\n**bold** *em* `code`\n\n- one\n- two\n\n<script>alert(1)</script>",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("allows only https and data image URLs", () => {
    const html = renderMarkdown(
      "[ok](https://example.com) [bad](javascript:alert(1)) ![image](data:image/png;base64,abc) ![bad](http://example.com/x.png)",
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).not.toContain('href="javascript:');
    expect(html).not.toContain('src="http://example.com/x.png"');
  });
});
