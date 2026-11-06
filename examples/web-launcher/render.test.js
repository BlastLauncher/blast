import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./render.js";

describe("renderMarkdown", () => {
  test("renders the safe subset and escapes HTML", () => {
    const html = renderMarkdown(
      "# Title\n\n**bold** *em* `code`\n\n- one\n- two\n\n<script>alert(1)</script>",
    );
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>em</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<ul><li>one</li><li>two</li></ul>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("allows only https links and https or data:image images", () => {
    const html = renderMarkdown(
      "[ok](https://example.com) [bad](javascript:alert(1)) [plain](http://example.com) ![image](data:image/png;base64,abc) ![bad](http://example.com/x.png) ![data](data:text/html;base64,abc)",
    );
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('src="data:image/png;base64,abc"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('href="http:');
    expect(html).not.toContain('src="http:');
    expect(html).not.toContain("data:text/html");
    // A rejected link keeps its visible label so no text is lost.
    expect(html).toContain("bad");
  });

  test("allows https images", () => {
    expect(renderMarkdown("![logo](https://example.com/a.png)")).toContain(
      '<img src="https://example.com/a.png" alt="logo">',
    );
  });

  test("emphasis does not rewrite inside URLs or code", () => {
    const html = renderMarkdown(
      "[x](https://e.com/a_b_c) ![i](https://e.com/*x*/p_q_r.png) `a_b_c and *d*` snake_case_word",
    );
    expect(html).toContain('href="https://e.com/a_b_c"');
    expect(html).toContain('src="https://e.com/*x*/p_q_r.png"');
    expect(html).toContain("<code>a_b_c and *d*</code>");
    expect(html).toContain("snake_case_word");
    expect(html).not.toContain("<em>");
    expect(html).not.toContain("<strong>");
  });

  test("applies emphasis inside a link label", () => {
    expect(renderMarkdown("[**bold** label](https://e.com)")).toContain(
      '<a href="https://e.com" rel="noreferrer noopener"><strong>bold</strong> label</a>',
    );
  });

  test("quotes in a URL cannot break out of the attribute", () => {
    const html = renderMarkdown(
      '[x](https://e.com/"onmouseover="alert(1)) ![y](https://e.com/"onerror="x)',
    );
    expect(html).toContain("&quot;onmouseover=&quot;");
    expect(html).not.toContain('"onmouseover');
    expect(html).not.toContain('"onerror');
    expect(html).not.toMatch(/<a [^>]*\sonmouseover=/u);
  });
});
