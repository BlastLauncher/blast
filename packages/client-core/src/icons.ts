import type { JsonValue } from "@blastlauncher/protocol";

/**
 * A compact terminal stand-in for a Raycast icon. `tint` is a Raycast colour
 * name (`red`, `raycast-blue`, `secondary-text`) or a raw CSS colour; turning
 * it into a palette entry is the client's job, so this module stays free of
 * framework and palette imports.
 */
export type IconView = { label: string; tint?: string };

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

function tintOf(value: unknown): string | undefined {
  if (typeof value === "string") return tintRoles[value.toLowerCase()] ?? value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    // A DynamicColor picks the dark variant: the reference client is dark.
    const dynamic = value as { dark?: unknown; light?: unknown };
    return tintOf(dynamic.dark ?? dynamic.light);
  }
  return undefined;
}

type IconSource = {
  /** The raw icon name, image path or URL. */
  source?: string;
  tint?: string;
  /** Images and file icons render as a picture placeholder, not a name. */
  image?: boolean;
};

function sourceOf(value: JsonValue | undefined): IconSource {
  if (typeof value === "string")
    return { source: value, ...(looksLikeImage(value) ? { image: true } : {}) };
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const icon = value as Record<string, unknown>;
  if (typeof icon.fileIcon === "string") return { source: icon.fileIcon, image: true };
  const tint = tintOf(icon.tintColor);
  const source = icon.source;
  if (typeof source === "string")
    return {
      source,
      ...(tint ? { tint } : {}),
      ...(looksLikeImage(source) ? { image: true } : {}),
    };
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const dynamic = source as { dark?: unknown; light?: unknown };
    const selected = dynamic.dark ?? dynamic.light;
    if (typeof selected === "string")
      return {
        source: selected,
        ...(tint ? { tint } : {}),
        ...(looksLikeImage(selected) ? { image: true } : {}),
      };
  }
  return tint ? { tint } : {};
}

function looksLikeImage(source: string): boolean {
  return (
    /^(https?:|data:|file:|\/)/i.test(source) ||
    /\.(png|jpe?g|gif|svg|webp|bmp|heic)$/i.test(source)
  );
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

/** Convert a Raycast image/icon value to a compact terminal representation. */
export function iconView(value: JsonValue | undefined): IconView {
  const { source, tint, image } = sourceOf(value);
  if (!source) return { label: "◇", ...(tint ? { tint } : {}) };
  const name = iconName(source);
  const glyph =
    glyphs[name] ?? glyphs[name.replace(/(?:filled|disabled|small|large)$/, "")] ?? undefined;
  const label = glyph ?? (image ? "▣" : fallbackLabel(source));
  return { label, ...(tint ? { tint } : {}) };
}
