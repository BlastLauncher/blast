import type { SceneNode } from "@blastlauncher/scene";

import Icons from "./components/Icon";

export type V2SceneIconKind = "icon" | "content";
export type V2SceneIconSize = "small" | "medium" | "large";

export interface V2SceneIconProps {
  readonly node: SceneNode;
  readonly kind?: V2SceneIconKind;
  readonly size?: V2SceneIconSize;
}

export function V2SceneIcon({ node, kind = "icon", size = "medium" }: V2SceneIconProps): React.JSX.Element {
  const source = selectV2SceneImageSource(node, kind);
  const sizeClass = sizeClasses(size);

  if (source !== undefined) {
    const Icon = Icons[source as keyof typeof Icons];
    if (Icon !== undefined) {
      return (
        <span
          aria-hidden="true"
          className={`flex ${sizeClass} shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full`}
          data-v2-icon-source={source}
          data-v2-icon-kind={kind}
        >
          <Icon aria-hidden="true" />
        </span>
      );
    }

    if (isSupportedImageSource(source)) {
      return (
        <img
          alt=""
          className={`${sizeClass} shrink-0 rounded-md object-contain`}
          data-v2-icon-source={source}
          data-v2-icon-kind={kind}
          src={normalizeImageSource(source)}
        />
      );
    }
  }

  return (
    <span
      aria-hidden="true"
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-md bg-white/10 text-xs text-white/70`}
      data-v2-icon-kind={kind}
    >
      {firstLetter(source)}
    </span>
  );
}

export function selectV2SceneImageSource(node: SceneNode, kind: V2SceneIconKind = "icon"): string | undefined {
  const prefix = kind === "content" ? "content" : "icon";
  const candidates = [
    stringProp(node, `${prefix}Dark`),
    stringProp(node, prefix),
    stringProp(node, `${prefix}FallbackDark`),
    stringProp(node, `${prefix}Fallback`),
  ].filter((candidate): candidate is string => candidate !== undefined && candidate.trim().length > 0);

  return (
    candidates.find((candidate) => isRegisteredIcon(candidate) || isSupportedImageSource(candidate)) ?? candidates[0]
  );
}

function isRegisteredIcon(source: string): boolean {
  return Icons[source as keyof typeof Icons] !== undefined;
}

function isSupportedImageSource(source: string): boolean {
  return source.startsWith("data:image/") || source.startsWith("https://") || source.startsWith("http://");
}

function normalizeImageSource(source: string): string {
  if (!source.startsWith("data:image/svg+xml,")) {
    return source;
  }
  const comma = source.indexOf(",");
  const body = source.slice(comma + 1);
  if (!body.trimStart().startsWith("<")) {
    return source;
  }
  return `${source.slice(0, comma + 1)}${encodeURIComponent(body)}`;
}

function stringProp(node: SceneNode, name: string): string | undefined {
  const value = node.props[name];
  return typeof value === "string" ? value : undefined;
}

function firstLetter(source: string | undefined): string {
  return source?.trim().slice(0, 1).toUpperCase() || "•";
}

function sizeClasses(size: V2SceneIconSize): string {
  switch (size) {
    case "small":
      return "h-4 w-4";
    case "large":
      return "h-10 w-10";
    default:
      return "h-8 w-8";
  }
}
