import type { PathLike } from "node:fs";
import { pathParam, toApplication } from "./applications.ts";
import { requestCapability } from "./capability.ts";
import type { Application } from "./open.ts";

export interface FileSystemItem {
  path: string;
}

export async function getSelectedText(): Promise<string> {
  const value = await requestCapability("selection.text", {});
  if (typeof value !== "string") throw new TypeError("getSelectedText: invalid host response");
  if (value === "") throw new Error("No text selected");
  return value;
}

export async function getSelectedFinderItems(): Promise<FileSystemItem[]> {
  const value = await requestCapability("selection.files", {});
  if (!Array.isArray(value)) throw new TypeError("getSelectedFinderItems: invalid host response");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.path !== "string") {
      throw new TypeError("getSelectedFinderItems: invalid FileSystemItem");
    }
    return { path: item.path };
  });
}

export async function getFrontmostApplication(): Promise<Application> {
  return toApplication(
    await requestCapability("applications.frontmost", {}),
    "getFrontmostApplication",
  );
}

export async function showInFinder(path: PathLike): Promise<void> {
  await requestCapability("finder.show", { path: pathParam(path, "showInFinder") });
}

export async function trash(path: PathLike | PathLike[]): Promise<void> {
  const paths = (Array.isArray(path) ? path : [path]).map((item) => pathParam(item, "trash"));
  await requestCapability("trash", { paths });
}
