import type { JsonValue } from "@blastlauncher/protocol";

/** What a graphical client draws for an icon; `label` stays the text fallback. */
export type IconSource =
  | { kind: "builtin"; name: string }
  | { kind: "url"; url: string }
  | { kind: "file"; path: string }
  | { kind: "fileIcon"; path: string };
export type IconMask = "circle" | "roundedRectangle";
export type IconAppearance = "light" | "dark";
export type IconOptions = {
  /** Picks the light or dark variant of sources and tints. Default: "light". */
  appearance?: IconAppearance;
  /** Absolute directory that relative image names (`icon.png`) resolve under. */
  assetsDir?: string;
};

/**
 * An icon as a client draws it. `label` is a compact terminal stand-in; `tint`
 * is a Raycast colour name (`red`, `raycast-blue`, `secondary-text`) or a raw
 * CSS colour, and turning it into a palette entry is the client's job, so this
 * module stays free of framework and palette imports. `source` and `mask` tell
 * a graphical client what to draw: the variant for the requested appearance,
 * with relative asset names already absolute.
 */
export type IconView = { label: string; tint?: string; source?: IconSource; mask?: IconMask };

/** The optional icon fields every view row carries, flattened under `icon*` names. */
export function iconFields(icon: IconView | undefined): {
  iconTint?: string;
  iconSource?: IconSource;
  iconMask?: IconMask;
} {
  return {
    ...(icon?.tint ? { iconTint: icon.tint } : {}),
    ...(icon?.source ? { iconSource: icon.source } : {}),
    ...(icon?.mask ? { iconMask: icon.mask } : {}),
  };
}

// Keyed by the icon name without Raycast's `-16` size suffix, lowercase and
// with separators removed (`Icon.ArrowDown` -> "arrowdown"). Aliases share a
// glyph where Raycast has several names for the same picture.
const glyphs: Record<string, string> = {
  add: "+",
  addperson: "+",
  airplane: "✈",
  alarm: "⏰",
  alarmringing: "⏰",
  aligncentre: "≡",
  alignleft: "≡",
  alignright: "≡",
  anchor: "⚓",
  appwindow: "▭",
  appwindowgrid2x2: "▦",
  appwindowgrid3x3: "▦",
  appwindowlist: "☰",
  appwindowsidebarleft: "▯",
  appwindowsidebarright: "▯",
  arrowclockwise: "↻",
  arrowcounterclockwise: "↺",
  arrowdown: "↓",
  arrowdowncircle: "↓",
  arrowleft: "←",
  arrowleftcircle: "←",
  arrowne: "↗",
  arrowright: "→",
  arrowrightcircle: "→",
  arrowup: "↑",
  arrowupcircle: "↑",
  arrowscontract: "⤡",
  arrowsexpand: "⤢",
  atsymbol: "@",
  barchart: "▥",
  barcode: "▮",
  battery: "▭",
  batterycharging: "▭",
  batterydisabled: "▭",
  bell: "♢",
  belldisabled: "♢",
  bicycle: "⚲",
  bike: "⚲",
  binoculars: "◎",
  bird: "▷",
  blankdocument: "▤",
  bluetooth: "ᛒ",
  bold: "B",
  bolt: "ϟ",
  boltdisabled: "ϟ",
  book: "▤",
  bookmark: "▮",
  box: "▢",
  brush: "✎",
  bug: "☗",
  building: "▥",
  bulletpoints: "•",
  bullseye: "◎",
  calculator: "▦",
  calendar: "▦",
  camera: "◉",
  car: "▰",
  cart: "▰",
  cd: "◎",
  check: "✓",
  checkcircle: "✓",
  checklist: "✓",
  checkmark: "✓",
  chevrondown: "⌄",
  chevronleft: "‹",
  chevronright: "›",
  chevronup: "⌃",
  chevronupdown: "⇕",
  circle: "●",
  circledisabled: "○",
  circleellipsis: "◌",
  circlefilled: "●",
  circleprogress: "◌",
  clipboard: "▧",
  clock: "◷",
  cloud: "☁",
  cloudlightning: "☁",
  cloudrain: "☁",
  cloudsnow: "☁",
  cloudsun: "☁",
  code: "</>",
  codeblock: "</>",
  contrast: "◒",
  cog: "⚙",
  coin: "◉",
  coins: "◉",
  commandsymbol: "⌘",
  compass: "⊕",
  computerchip: "▣",
  copyclipboard: "⧉",
  creditcard: "▭",
  crop: "⌗",
  crown: "♛",
  crypto: "◈",
  deletedocument: "⌫",
  desktop: "▭",
  devices: "▭",
  dna: "⋈",
  document: "▤",
  dot: "·",
  download: "↓",
  droplets: "◌",
  duplicate: "⧉",
  eject: "⏏",
  ellipsis: "…",
  ellipsisvertical: "⋮",
  emoji: "☺",
  emojisad: "☹",
  envelope: "✉",
  eraser: "▱",
  exclamationmark: "!",
  exclamationmark2: "!",
  exclamationmark3: "!",
  eye: "◉",
  eyedisabled: "◌",
  eyedropper: "⌖",
  female: "♀",
  filmstrip: "▤",
  filter: "▽",
  finder: "⌕",
  fingerprint: "◎",
  flag: "⚑",
  folder: "▰",
  footprints: "∴",
  forward: "↷",
  gamecontroller: "▭",
  gauge: "◔",
  gear: "⚙",
  geopin: "⌖",
  gift: "▧",
  glasses: "∞",
  globe: "⊕",
  goal: "◎",
  hammer: "⚒",
  harddrive: "▭",
  hashtag: "#",
  heading: "H",
  headphones: "◠",
  heart: "♥",
  heartbeat: "♥",
  highlight: "▰",
  hourglass: "⌛",
  house: "⌂",
  humidity: "≈",
  image: "▣",
  important: "!",
  info: "ⓘ",
  italics: "I",
  key: "⚿",
  keyboard: "▦",
  layers: "▤",
  leaderboard: "▥",
  leaf: "❧",
  lightbulb: "☀",
  lightbulboff: "☼",
  linechart: "↗",
  link: "↗",
  list: "☰",
  livestream: "◉",
  lock: "⚿",
  lockdisabled: "⚿",
  lockunlocked: "⚿",
  logout: "⇥",
  lorry: "▰",
  lowercase: "a",
  magnifyingglass: "⌕",
  male: "♂",
  map: "⌗",
  mask: "◒",
  maximize: "⤢",
  medicalsupport: "+",
  megaphone: "◁",
  memorychip: "▣",
  memorystick: "▭",
  message: "▤",
  microphone: "◉",
  microphonedisabled: "◌",
  minimize: "⤡",
  minus: "−",
  minuscircle: "−",
  mobile: "▯",
  monitor: "▭",
  moon: "☾",
  moondown: "☾",
  moonrise: "☾",
  moonup: "☽",
  mountain: "▲",
  mouse: "▭",
  move: "✥",
  mug: "▯",
  multiply: "×",
  music: "♪",
  network: "⌗",
  newdocument: "+",
  newfolder: "+",
  number: "#",
  numberlist: "#",
  paperclip: "⌇",
  paragraph: "¶",
  patch: "✚",
  pause: "Ⅱ",
  pencil: "✎",
  person: "●",
  personcircle: "●",
  personlines: "●",
  phone: "☏",
  phoneringing: "☏",
  piechart: "◔",
  pill: "◍",
  pin: "⌖",
  pindisabled: "⌖",
  play: "▶",
  plug: "⚡",
  plus: "+",
  pluscircle: "+",
  plusminusedividemultiply: "±",
  plussquare: "+",
  plustoprightsquare: "+",
  power: "⏻",
  print: "⎙",
  questionmarkcircle: "?",
  quicklink: "↗",
  quotationmarks: "“",
  quoteblock: "▮",
  receipt: "▤",
  redo: "↷",
  removeperson: "−",
  repeat: "↻",
  replace: "⇄",
  reply: "↰",
  rewind: "◀",
  rocket: "▲",
  rosette: "✿",
  rotateanticlockwise: "↺",
  rotateclockwise: "↻",
  rss: "◎",
  ruler: "⌗",
  savedocument: "▤",
  shield: "⛨",
  shortparagraph: "¶",
  shuffle: "⤨",
  signal: "▂",
  snippets: "▤",
  snowflake: "❄",
  soccerball: "◉",
  speaker: "◁",
  speakerdown: "◁",
  speakerlow: "◁",
  speakerhigh: "◁",
  speakeroff: "◁",
  speakeron: "◁",
  speakerup: "◁",
  speechbubble: "▤",
  speechbubbleactive: "▣",
  speechbubbleimportant: "!",
  stackedbars: "▤",
  star: "★",
  starcircle: "★",
  stardisabled: "☆",
  stars: "✦",
  stop: "■",
  stopwatch: "◷",
  store: "⌂",
  strikethrough: "S",
  sun: "☀",
  sunrise: "☀",
  swatch: "◧",
  switch: "⇄",
  syringe: "⌇",
  tack: "⌖",
  tag: "⌑",
  temperature: "°",
  terminal: "▮",
  text: "T",
  textcursor: "▏",
  textinput: "▭",
  textselection: "▮",
  thumbsdown: "▽",
  thumbsup: "△",
  ticket: "▤",
  torch: "◉",
  trash: "⌫",
  tray: "▤",
  tree: "♣",
  trophy: "♛",
  twopeople: "●",
  umbrella: "☂",
  underline: "U",
  undo: "↶",
  upload: "↑",
  uppercase: "A",
  video: "▶",
  videodisabled: "▶",
  wallet: "▭",
  wand: "✧",
  warning: "⚠",
  waveform: "∿",
  weights: "▭",
  wifi: "▂",
  wifidisabled: "▂",
  wind: "≈",
  windsock: "◁",
  wrenchscrewdriver: "⚒",
  wristwatch: "◷",
  xmark: "×",
  xmarkcircle: "×",
  xmarktopleftsquare: "⧉",
  xmarktrightsquare: "⧉",
  xmarktoprightsquare: "⧉",
};

// Raycast's semantic colour names collapse to the roles every client palette
// has; a raw CSS colour is passed through untouched.
const tintRoles: Record<string, string> = {
  "raycast-blue": "blue",
  "raycast-green": "green",
  "raycast-magenta": "magenta",
  "raycast-orange": "orange",
  "raycast-purple": "purple",
  "raycast-red": "red",
  "raycast-yellow": "yellow",
  "raycast-primary-text": "primary-text",
  "raycast-secondary-text": "secondary-text",
  blue: "blue",
  green: "green",
  magenta: "magenta",
  orange: "orange",
  purple: "purple",
  red: "red",
  yellow: "yellow",
};

function tintOf(value: unknown, appearance: IconAppearance): string | undefined {
  if (typeof value === "string") return tintRoles[value.toLowerCase()] ?? value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const dynamic = value as { dark?: unknown; light?: unknown };
    return tintOf(
      appearance === "dark" ? (dynamic.dark ?? dynamic.light) : (dynamic.light ?? dynamic.dark),
      appearance,
    );
  }
  return undefined;
}

type ParsedIcon = {
  /** The raw icon name, image path or URL. */
  source?: string;
  /** A FileIcon path: the icon the OS shows for that file. */
  fileIcon?: string;
  tint?: string;
  mask?: IconMask;
  /** Images and file icons render as a picture placeholder, not a name. */
  image?: boolean;
};

function parse(value: JsonValue | undefined, appearance: IconAppearance): ParsedIcon {
  if (typeof value === "string")
    return { source: value, ...(looksLikeImage(value) ? { image: true } : {}) };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const icon = value as Record<string, unknown>;
  if (typeof icon.fileIcon === "string") return { fileIcon: icon.fileIcon, image: true };
  const tint = tintOf(icon.tintColor, appearance);
  const mask = icon.mask === "circle" || icon.mask === "roundedRectangle" ? icon.mask : undefined;
  let source = icon.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const dynamic = source as { dark?: unknown; light?: unknown };
    source =
      appearance === "dark" ? (dynamic.dark ?? dynamic.light) : (dynamic.light ?? dynamic.dark);
  }
  return {
    ...(typeof source === "string"
      ? { source, ...(looksLikeImage(source) ? { image: true } : {}) }
      : {}),
    ...(tint ? { tint } : {}),
    ...(mask ? { mask } : {}),
  };
}

function looksLikeImage(source: string): boolean {
  return (
    /^(https?:|data:|file:|\/)/i.test(source) ||
    /\.(png|jpe?g|gif|svg|webp|bmp|heic)$/i.test(source)
  );
}

/** Where a string icon points; undefined when a relative asset has no directory to resolve under. */
function sourceOf(source: string, assetsDir: string | undefined): IconSource | undefined {
  if (/^(https?:|data:)/i.test(source)) return { kind: "url", url: source };
  if (/^file:/i.test(source)) {
    try {
      return { kind: "file", path: decodeURIComponent(new URL(source).pathname) };
    } catch {
      return undefined;
    }
  }
  if (source.startsWith("/") || /^[a-z]:[\\/]/i.test(source)) return { kind: "file", path: source };
  if (!looksLikeImage(source)) return { kind: "builtin", name: source };
  // An extension must not reach outside its own assets directory.
  if (!assetsDir || source.split(/[\\/]/).includes("..")) return undefined;
  return {
    kind: "file",
    path: `${assetsDir.replace(/[\\/]+$/, "")}/${source.replace(/^\.?[\\/]/, "")}`,
  };
}

/** `globe-01-16` -> "globe": drop the file extension, `16` size and `01` index suffixes. */
function iconName(source: string): string {
  const base = (source.split(/[\\/]/).at(-1) ?? source).replace(/\.[a-z0-9]{1,5}$/i, "");
  const parts = base.split(/[-_\s]+/).filter(Boolean);
  while (parts.length > 1 && /^\d{1,2}$/.test(parts.at(-1) ?? "")) parts.pop();
  return parts.join("").toLowerCase();
}

function titleCase(words: string): string {
  return words.replace(
    /(^|\s)(\S)/g,
    (_whole, space: string, letter: string) => `${space}${letter.toUpperCase()}`,
  );
}

/** A readable short label for an icon name the glyph table does not know. */
function fallbackLabel(source: string): string {
  const base = (source.split(/[\\/]/).at(-1) ?? source).replace(/\.[a-z0-9]{1,5}$/i, "");
  const parts = base.split(/[-_\s]+/).filter(Boolean);
  while (parts.length > 1 && /^\d{1,2}$/.test(parts.at(-1) ?? "")) parts.pop();
  const words = parts.join(" ").trim();
  if (!words) return "◇";
  const label = titleCase(words);
  return label.length <= 12 ? label : `${titleCase(words.slice(0, 9))}…`;
}

/** Convert a Raycast image/icon value to a terminal label plus a drawable source. */
export function iconView(value: JsonValue | undefined, options: IconOptions = {}): IconView {
  const { source, fileIcon, tint, mask, image } = parse(value, options.appearance ?? "light");
  const drawable: IconSource | undefined =
    fileIcon !== undefined
      ? { kind: "fileIcon", path: fileIcon }
      : source === undefined
        ? undefined
        : sourceOf(source, options.assetsDir);
  const extras = {
    ...(tint ? { tint } : {}),
    ...(drawable ? { source: drawable } : {}),
    ...(mask ? { mask } : {}),
  };
  if (!source) return { label: fileIcon === undefined ? "◇" : "▣", ...extras };
  const name = iconName(source);
  const glyph =
    glyphs[name] ?? glyphs[name.replace(/(?:filled|disabled|small|large)$/, "")] ?? undefined;
  const label = glyph ?? (image ? "▣" : fallbackLabel(source));
  return { label, ...extras };
}
