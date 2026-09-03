import type { SceneNode } from "@blastlauncher/scene";

import Icons from "./components/Icon";

export type V2SceneIconKind = "icon" | "content" | "accessory";
export type V2SceneIconSize = "small" | "medium" | "large";
export type V2SceneIconTheme = "light" | "dark";

export const V2_SCENE_ICON_MIN_CONTRAST_RATIO = 3;

const V2_SCENE_ICON_BACKGROUNDS: Readonly<Record<V2SceneIconTheme, string>> = {
  light: "#fcfcfc",
  dark: "#161616",
};

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
      data-v2-icon-tint-adjust-contrast={tint !== undefined && tint.adjustContrast !== false ? "true" : undefined}
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
  const prefix = sceneIconPrefix(kind);
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
  const prefix = sceneIconPrefix(kind);
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
  const prefix = sceneIconPrefix(kind);
  return stringProp(node, `${prefix}Mask`);
}

function sceneIconPrefix(kind: V2SceneIconKind): "icon" | "content" | "accessoryIcon" {
  return kind === "accessory" ? "accessoryIcon" : kind;
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
  const adjustContrast = tint.adjustContrast !== false;
  const light = resolveTintColor(tint.light, "light", adjustContrast);
  const dark = resolveTintColor(tint.dark ?? tint.light, "dark", adjustContrast);
  if (light === undefined && dark === undefined) {
    return undefined;
  }
  return {
    ...(light === undefined ? {} : { "--v2-icon-tint-light": light }),
    ...(dark === undefined ? {} : { "--v2-icon-tint-dark": dark }),
  };
}

function resolveTintColor(
  value: string | undefined,
  theme: V2SceneIconTheme,
  adjustContrast: boolean,
): string | undefined {
  const normalized = value === undefined ? undefined : normalizeV2SceneColor(value);
  return normalized === undefined || !adjustContrast ? normalized : adjustV2SceneColorContrast(normalized, theme);
}

export function adjustV2SceneColorContrast(value: string, theme: V2SceneIconTheme): string {
  const color = parseV2SceneColor(value);
  const background = parseV2SceneColor(V2_SCENE_ICON_BACKGROUNDS[theme]);
  if (color === undefined || background === undefined) {
    return value;
  }

  if (contrastRatio(color, background) >= V2_SCENE_ICON_MIN_CONTRAST_RATIO) {
    return value;
  }

  const candidates = [
    findContrastCandidate(color, background, { r: 0, g: 0, b: 0 }),
    findContrastCandidate(color, background, { r: 255, g: 255, b: 255 }),
  ].filter((candidate): candidate is ContrastCandidate => candidate !== undefined);
  if (candidates.length === 0) {
    return value;
  }
  const best = candidates.reduce((current, candidate) => (candidate.amount < current.amount ? candidate : current));
  return formatContrastCandidate(color, background, best);
}

export function v2SceneIconContrastRatio(value: string, theme: V2SceneIconTheme): number | undefined {
  const color = parseV2SceneColor(value);
  const background = parseV2SceneColor(V2_SCENE_ICON_BACKGROUNDS[theme]);
  return color === undefined || background === undefined ? undefined : contrastRatio(color, background);
}

interface V2SceneRGB {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ContrastCandidate {
  readonly amount: number;
  readonly color: V2SceneRGB;
  readonly target: V2SceneRGB;
}

function findContrastCandidate(
  color: V2SceneRGB,
  background: V2SceneRGB,
  target: V2SceneRGB,
): ContrastCandidate | undefined {
  if (contrastRatio(mixV2SceneColors(color, target, 1), background) < V2_SCENE_ICON_MIN_CONTRAST_RATIO) {
    return undefined;
  }

  let low = 0;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const amount = (low + high) / 2;
    if (contrastRatio(mixV2SceneColors(color, target, amount), background) >= V2_SCENE_ICON_MIN_CONTRAST_RATIO) {
      high = amount;
    } else {
      low = amount;
    }
  }
  return { amount: high, color: mixV2SceneColors(color, target, high), target };
}

function formatContrastCandidate(original: V2SceneRGB, background: V2SceneRGB, candidate: ContrastCandidate): string {
  const direct = formatV2SceneColor(candidate.color);
  const directColor = parseV2SceneColor(direct);
  if (directColor !== undefined && contrastRatio(directColor, background) >= V2_SCENE_ICON_MIN_CONTRAST_RATIO) {
    return direct;
  }

  let low = candidate.amount;
  let high = 1;
  for (let index = 0; index < 24; index += 1) {
    const amount = (low + high) / 2;
    const color = parseV2SceneColor(formatV2SceneColor(mixV2SceneColors(original, candidate.target, amount)));
    if (color !== undefined && contrastRatio(color, background) >= V2_SCENE_ICON_MIN_CONTRAST_RATIO) {
      high = amount;
    } else {
      low = amount;
    }
  }
  return formatV2SceneColor(mixV2SceneColors(original, candidate.target, high));
}

function mixV2SceneColors(first: V2SceneRGB, second: V2SceneRGB, amount: number): V2SceneRGB {
  return {
    r: first.r + (second.r - first.r) * amount,
    g: first.g + (second.g - first.g) * amount,
    b: first.b + (second.b - first.b) * amount,
  };
}

function contrastRatio(first: V2SceneRGB, second: V2SceneRGB): number {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: V2SceneRGB): number {
  const red = linearizeV2SceneChannel(color.r / 255);
  const green = linearizeV2SceneChannel(color.g / 255);
  const blue = linearizeV2SceneChannel(color.b / 255);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function linearizeV2SceneChannel(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function formatV2SceneColor(color: V2SceneRGB): string {
  return `#${[color.r, color.g, color.b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

function parseV2SceneColor(value: string): V2SceneRGB | undefined {
  const normalized = value.trim().toLowerCase();
  const hex = normalized.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex !== null) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((digit) => `${digit}${digit}`)
            .join("")
        : hex[1];
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  const functionMatch = normalized.match(/^(rgba?|hsla?)\((.*)\)$/);
  if (functionMatch !== null) {
    return functionMatch[1].startsWith("rgb")
      ? parseV2SceneRGBFunction(functionMatch[2])
      : parseV2SceneHSLFunction(functionMatch[2]);
  }

  const named = V2_SCENE_CSS_COLORS[normalized];
  return named === undefined ? undefined : parseV2SceneColor(named);
}

function parseV2SceneRGBFunction(value: string): V2SceneRGB | undefined {
  const [channels, alpha] = splitV2SceneColorFunction(value);
  if (channels.length !== 3 || !isOpaqueV2SceneAlpha(alpha)) {
    return undefined;
  }
  const parsed = channels.map(parseV2SceneRGBChannel);
  return parsed.every((channel): channel is number => channel !== undefined)
    ? { r: parsed[0], g: parsed[1], b: parsed[2] }
    : undefined;
}

function parseV2SceneHSLFunction(value: string): V2SceneRGB | undefined {
  const [channels, alpha] = splitV2SceneColorFunction(value);
  if (channels.length !== 3 || !isOpaqueV2SceneAlpha(alpha)) {
    return undefined;
  }
  const hue = parseV2SceneHue(channels[0]);
  const saturation = parseV2ScenePercentage(channels[1]);
  const lightness = parseV2ScenePercentage(channels[2]);
  if (hue === undefined || saturation === undefined || lightness === undefined) {
    return undefined;
  }

  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match =
    hueSection < 1
      ? [chroma, secondary, 0]
      : hueSection < 2
        ? [secondary, chroma, 0]
        : hueSection < 3
          ? [0, chroma, secondary]
          : hueSection < 4
            ? [0, secondary, chroma]
            : hueSection < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  const lightnessAdjustment = lightness - chroma / 2;
  return {
    r: (match[0] + lightnessAdjustment) * 255,
    g: (match[1] + lightnessAdjustment) * 255,
    b: (match[2] + lightnessAdjustment) * 255,
  };
}

function splitV2SceneColorFunction(value: string): [channels: string[], alpha: string | undefined] {
  const [channelText, alphaText] = value.split("/").map((part) => part.trim());
  const commaParts = channelText.includes(",")
    ? channelText.split(",").map((part) => part.trim())
    : channelText.split(/\s+/).filter((part) => part.length > 0);
  if (commaParts.length === 4 && alphaText === undefined) {
    return [commaParts.slice(0, 3), commaParts[3]];
  }
  return [commaParts, alphaText];
}

function parseV2SceneRGBChannel(value: string): number | undefined {
  if (value.endsWith("%")) {
    const percentage = Number.parseFloat(value.slice(0, -1));
    return Number.isFinite(percentage) ? clampV2SceneColor(percentage * 2.55, 0, 255) : undefined;
  }
  const channel = Number.parseFloat(value);
  return Number.isFinite(channel) ? clampV2SceneColor(channel, 0, 255) : undefined;
}

function parseV2SceneHue(value: string): number | undefined {
  const hue = Number.parseFloat(value.replace(/deg$/, ""));
  return Number.isFinite(hue) ? ((hue % 360) + 360) % 360 : undefined;
}

function parseV2ScenePercentage(value: string): number | undefined {
  if (!value.endsWith("%")) {
    return undefined;
  }
  const percentage = Number.parseFloat(value.slice(0, -1));
  return Number.isFinite(percentage) ? clampV2SceneColor(percentage / 100, 0, 1) : undefined;
}

function isOpaqueV2SceneAlpha(value: string | undefined): boolean {
  if (value === undefined) {
    return true;
  }
  if (value.endsWith("%")) {
    return Number.parseFloat(value.slice(0, -1)) >= 100;
  }
  return Number.parseFloat(value) >= 1;
}

function clampV2SceneColor(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

const V2_SCENE_CSS_COLORS: Readonly<Record<string, string>> = {
  aqua: "#00ffff",
  black: "#000000",
  blue: "#0000ff",
  brown: "#a52a2a",
  cyan: "#00ffff",
  fuchsia: "#ff00ff",
  gray: "#808080",
  green: "#008000",
  grey: "#808080",
  magenta: "#ff00ff",
  orange: "#ffa500",
  pink: "#ffc0cb",
  purple: "#800080",
  red: "#ff0000",
  white: "#ffffff",
  yellow: "#ffff00",
};

export function normalizeV2SceneColor(value: string): string | undefined {
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
