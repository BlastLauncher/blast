/** Packages provided by the host and therefore omitted from lean installs. */
export function supplied(name: string): boolean {
  return name === "@raycast/api" || /^react(?:\/|$)/.test(name) || name.startsWith("@types/");
}
