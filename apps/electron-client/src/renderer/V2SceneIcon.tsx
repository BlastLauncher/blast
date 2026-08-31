import type { SceneNode } from "@blastlauncher/scene";

import Icons from "./components/Icon";

export type V2SceneIconKind = "icon" | "content";
export type V2SceneIconSize = "small" | "medium" | "large";

export interface V2SceneIconProps {
  readonly node: SceneNode;
  readonly kind?: V2SceneIconKind;
  readonly size?: V2SceneIconSize;
}

export interface V2SceneIconTint {
  readonly light?: string;
  readonly dark?: string;
  readonly adjustContrast?: boolean;
}

export function V2SceneIcon({ node, kind = "icon", size = "medium" }: V2SceneIconProps): React.JSX.Element {
  const source = selectV2SceneImageSource(node, kind);
  const mask = selectV2SceneIconMask(node, kind);
  const tint = selectV2SceneIconTint(node, kind);
  const tintStyle = createTintStyle(tint);
  const sizeClass = sizeClasses(size);

  if (source !== undefined) {
    const Icon = Icons[source as keyof typeof Icons];
    if (Icon !== undefined) {
      return (
        <IconShell kind={kind} mask={mask} sizeClass={sizeClass} source={source} tint={tint} tintStyle={tintStyle}>
          <Icon aria-hidden="true" />
        </IconShell>
      );
    }

    if (isSupportedImageSource(source)) {
      return (
        <IconShell kind={kind} mask={mask} sizeClass={sizeClass} source={source} tint={tint} tintStyle={tintStyle}>
          <img
            alt=""
            className={`${sizeClass} shrink-0 object-contain${tintStyle === undefined ? "" : " grayscale"}`}
            src={normalizeImageSource(source)}
          />
          {tintStyle !== undefined && <IconTintOverlay />}
        </IconShell>
      );
    }
  }

  return (
    <IconShell kind={kind} mask={mask} sizeClass={sizeClass} tint={tint} tintStyle={tintStyle}>
      <span
        className={`rounded-md bg-white/10 px-1 text-xs ${tintStyle === undefined ? "text-white/70" : "text-current"}`}
      >
        {firstLetter(source)}
      </span>
    </IconShell>
  );
}

function IconShell({
  children,
  kind,
  mask,
  sizeClass,
  source,
  tint,
  tintStyle,
}: {
  readonly children: React.ReactNode;
  readonly kind: V2SceneIconKind;
  readonly mask?: string;
  readonly sizeClass: string;
  readonly source?: string;
  readonly tint?: V2SceneIconTint;
  readonly tintStyle?: V2IconStyle;
}): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`relative flex ${sizeClass} shrink-0 items-center justify-center [&>svg]:h-full [&>svg]:w-full ${maskClasses(mask)}`}
      data-v2-icon="true"
      data-v2-icon-kind={kind}
      data-v2-icon-mask={mask}
      data-v2-icon-source={source}
      data-v2-icon-tint={tint?.light ?? tint?.dark}
      data-v2-icon-tint-adjust-contrast={tint?.adjustContrast === true ? "true" : undefined}
      data-v2-icon-tinted={tintStyle === undefined ? undefined : "true"}
      style={tintStyle}
    >
      {children}
    </span>
  );
}

function IconTintOverlay(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{ backgroundColor: "currentColor", mixBlendMode: "color" }}
    />
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

export function selectV2SceneIconTint(node: SceneNode, kind: V2SceneIconKind = "icon"): V2SceneIconTint | undefined {
  const prefix = kind === "content" ? "content" : "icon";
  const light = stringProp(node, `${prefix}TintColor`);
  const dark = stringProp(node, `${prefix}TintColorDark`);
  const adjustContrast = booleanProp(node, `${prefix}TintColorAdjustContrast`);
  if (light === undefined && dark === undefined && adjustContrast === undefined) {
    return undefined;
  }
  return {
    ...(light === undefined ? {} : { light }),
    ...(dark === undefined ? {} : { dark }),
    ...(adjustContrast === undefined ? {} : { adjustContrast }),
  };
}

function selectV2SceneIconMask(node: SceneNode, kind: V2SceneIconKind): string | undefined {
  const prefix = kind === "content" ? "content" : "icon";
  return stringProp(node, `${prefix}Mask`);
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

function booleanProp(node: SceneNode, name: string): boolean | undefined {
  const value = node.props[name];
  return typeof value === "boolean" ? value : undefined;
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

function maskClasses(mask: string | undefined): string {
  switch (mask) {
    case "circle":
      return "overflow-hidden rounded-full";
    case "roundedRectangle":
      return "overflow-hidden rounded-[20%]";
    default:
      return "rounded-md";
  }
}

type V2IconStyle = React.CSSProperties & {
  readonly "--v2-icon-tint-light"?: string;
  readonly "--v2-icon-tint-dark"?: string;
};

const RAYCAST_TINT_COLORS: Readonly<Record<string, string>> = {
  "raycast-red": "#ff6363",
  "raycast-blue": "#5e9eff",
  "raycast-green": "#4ade80",
  "raycast-yellow": "#facc15",
  "raycast-orange": "#fb923c",
  "raycast-purple": "#a78bfa",
  "raycast-magenta": "#f472b6",
  "raycast-primary-text": "var(--gray12)",
  "raycast-secondary-text": "var(--gray11)",
};

function createTintStyle(tint: V2SceneIconTint | undefined): V2IconStyle | undefined {
  if (tint === undefined) {
    return undefined;
  }
  const light = tint.light === undefined ? undefined : safeCssColor(tint.light);
  const dark = tint.dark === undefined ? light : safeCssColor(tint.dark);
  if (light === undefined && dark === undefined) {
    return undefined;
  }
  return {
    ...(light === undefined ? {} : { "--v2-icon-tint-light": light }),
    ...(dark === undefined ? {} : { "--v2-icon-tint-dark": dark }),
  };
}

function safeCssColor(value: string): string | undefined {
  const normalized = value.trim();
  const builtIn = RAYCAST_TINT_COLORS[normalized];
  if (builtIn !== undefined) {
    return builtIn;
  }
  if (/^#[0-9a-f]{3,8}$/i.test(normalized)) {
    return normalized;
  }
  if (/^(?:rgba?|hsla?)\([0-9a-z.%+,\s/()-]+\)$/i.test(normalized)) {
    return normalized;
  }
  if (/^[a-z]+(?:-[a-z]+)*$/i.test(normalized)) {
    return normalized;
  }
  return undefined;
}
