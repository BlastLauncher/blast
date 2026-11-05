export type GitHubExtensionSource = {
  kind: "github";
  owner: string;
  repo: string;
  ref: string;
  path: string;
};

export type LocalExtensionSource = { kind: "local"; name: string };
export type ExtensionSource = GitHubExtensionSource | LocalExtensionSource;

/** Parses only the source shape accepted by the browser demo. */
export function parseExtensionSource(value: string): GitHubExtensionSource {
  const source = value.trim();
  if (!source) throw new Error("Enter a GitHub extension URL or name");
  if (!source.includes("://")) {
    if (source.includes("/") || source.includes("\\"))
      throw new Error("Extension names cannot contain a path separator");
    return {
      kind: "github",
      owner: "raycast",
      repo: "extensions",
      ref: "main",
      path: `extensions/${source}`,
    };
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Invalid extension URL");
  }
  if (url.protocol !== "https:" || url.hostname !== "github.com")
    throw new Error("Extension URL must use https://github.com");
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[2] !== "tree" || parts.length < 5)
    throw new Error("GitHub URL must be /<owner>/<repo>/tree/<ref>/<path>");
  const [owner, repo, , ref, ...path] = parts;
  if (!owner || !repo || !ref || path.length === 0)
    throw new Error("GitHub URL must include an extension path");
  return { kind: "github", owner, repo, ref, path: path.join("/") };
}

export function isTextExtension(path: string): boolean {
  return /\.(?:cjs|css|html?|js|jsx|json|md|mjs|ts|tsx|txt|yaml|yml)$/i.test(path);
}
