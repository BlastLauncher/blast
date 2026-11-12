import { Detail } from "@raycast/api";

// An inline SVG keeps the image offline; the browser renders only https and data images.
const badge = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="64"><rect width="240" height="64" rx="14" fill="#ff6338"/><text x="120" y="41" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff" text-anchor="middle">Blast</text></svg>',
)}`;

const markdown = `# Markdown Detail

A Detail view renders **markdown** from the extension.

## What you can use

- Headings, **bold** and *italic* text
- Inline \`code\` such as \`showToast()\`
- Links like [the Blast repository](https://github.com/blastlauncher/blast)

### An image

![Blast badge](${badge})

Press Esc to go back.`;

export default function Command() {
  return <Detail navigationTitle="Markdown Detail" markdown={markdown} />;
}
