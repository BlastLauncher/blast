// Replays the committed `blast-tui` recording (asciicast v2) in a ghostty-web
// terminal. The site bundles this module to /tui-player.js; the landing page
// lazy-imports it and calls `mountTuiPlayer`.
import { init, Terminal } from "ghostty-web";
import { createPlayback, parseCast, tuiTerminalTheme, type Playback } from "./tui-cast.ts";

export type TuiPlayer = {
  dispose(): void;
  /** The terminal's visible text, one line per row (empty until loaded). */
  text(): string;
};

const style = `
.tui-player{display:grid;gap:8px;min-width:0}
.tui-player-screen{overflow:hidden;border-radius:8px;background:${tuiTerminalTheme.background}}
.tui-player-term{transform-origin:0 0;width:max-content;padding:10px 12px}
.tui-player-controls{display:flex;align-items:center;gap:10px;font:12px/1 "IBM Plex Mono",ui-monospace,monospace}
.tui-player-toggle{font:inherit;color:inherit;background:none;border:1px solid currentColor;border-radius:4px;padding:4px 8px;cursor:pointer;opacity:.8}
.tui-player-toggle:hover{opacity:1}
.tui-player-progress{flex:1;height:3px;border-radius:2px;background:color-mix(in srgb,currentColor 18%,transparent);overflow:hidden}
.tui-player-progress>span{display:block;height:100%;width:0;background:currentColor;opacity:.7}
.tui-player-error{font:13px/1.4 "IBM Plex Mono",ui-monospace,monospace;opacity:.7;padding:12px}
`;

function ensureStyle() {
  if (document.getElementById("tui-player-style")) return;
  const element = document.createElement("style");
  element.id = "tui-player-style";
  element.textContent = style;
  document.head.append(element);
}

export function mountTuiPlayer(element: HTMLElement, castUrl: string): TuiPlayer {
  ensureStyle();
  element.classList.add("tui-player");
  const screenBox = document.createElement("div");
  screenBox.className = "tui-player-screen";
  const host = document.createElement("div");
  host.className = "tui-player-term";
  // A recording, not a terminal: ghostty-web focuses and labels its element as
  // a text box on open, which would steal focus and scroll the page.
  host.inert = true;
  screenBox.append(host);
  const controls = document.createElement("div");
  controls.className = "tui-player-controls";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "tui-player-toggle";
  const bar = document.createElement("div");
  bar.className = "tui-player-progress";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("span");
  bar.append(fill);
  controls.append(toggle, bar);
  element.replaceChildren(screenBox, controls);

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let disposed = false,
    terminal: Terminal | undefined,
    playback: Playback | undefined,
    // Reduced motion shows the last frame until the reader asks for playback.
    paused = reduceMotion.matches,
    onScreen = true,
    frame = 0,
    last = 0;
  const cleanups: Array<() => void> = [];

  const render = () => {
    toggle.textContent = paused ? "Play" : "Pause";
    toggle.setAttribute("aria-label", paused ? "Play the recording" : "Pause the recording");
    fill.style.width = `${((playback?.progress ?? 0) * 100).toFixed(2)}%`;
  };
  const running = () => !!playback && !paused && onScreen && document.visibilityState === "visible";
  const tick = (now: number) => {
    frame = 0;
    if (!running()) return;
    // A long frame (a background tab catching up) must not skip a scene.
    playback!.advance(Math.min(0.25, (now - last) / 1000));
    last = now;
    render();
    frame = requestAnimationFrame(tick);
  };
  const schedule = () => {
    if (disposed || frame || !running()) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  };
  const listen = <T extends EventTarget>(target: T, type: string, handler: () => void) => {
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };
  listen(toggle, "click", () => {
    paused = !paused;
    render();
    schedule();
  });
  listen(document, "visibilitychange", schedule);
  listen(reduceMotion, "change", () => {
    if (!reduceMotion.matches) return;
    paused = true;
    playback?.finish();
    render();
  });
  const visibility = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  visibility.observe(element);
  cleanups.push(() => visibility.disconnect());
  render();

  const fit = () => {
    const canvas = host.querySelector("canvas");
    if (!canvas) return;
    // The canvas keeps its natural size; the wrapper scales it to the width.
    const width = host.offsetWidth,
      height = host.offsetHeight;
    const scale = width ? screenBox.clientWidth / width : 1;
    host.style.transform = `scale(${scale})`;
    screenBox.style.height = `${Math.round(height * scale)}px`;
  };
  const resize = new ResizeObserver(fit);
  resize.observe(screenBox);
  cleanups.push(() => resize.disconnect());

  void (async () => {
    try {
      const [cast] = await Promise.all([
        fetch(castUrl).then(async (response) => {
          if (!response.ok) throw new Error(`${castUrl}: HTTP ${response.status}`);
          return parseCast(await response.text());
        }),
        init(),
        document.fonts?.load('14px "IBM Plex Mono"').catch(() => undefined),
      ]);
      if (disposed) return;
      terminal = new Terminal({
        cols: cast.header.width,
        rows: cast.header.height,
        fontSize: 14,
        fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        theme: tuiTerminalTheme,
        cursorBlink: false,
        disableStdin: true,
        scrollback: 0,
      });
      terminal.open(host);
      for (const name of ["contenteditable", "role", "aria-label", "aria-multiline", "tabindex"])
        host.removeAttribute(name);
      const screen = terminal;
      playback = createPlayback(cast, {
        write: (data) => screen.write(data),
        reset: () => screen.reset(),
      });
      if (paused) playback.finish();
      fit();
      render();
      schedule();
    } catch (error) {
      if (disposed) return;
      const message = document.createElement("p");
      message.className = "tui-player-error";
      message.textContent = "The terminal recording could not be loaded.";
      element.replaceChildren(message);
      console.error(error);
    }
  })();

  return {
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      for (const cleanup of cleanups) cleanup();
      terminal?.dispose();
      element.replaceChildren();
      element.classList.remove("tui-player");
    },
    text() {
      const buffer = terminal?.buffer.active;
      if (!buffer || !terminal) return "";
      const lines: string[] = [];
      for (let row = 0; row < terminal.rows; row++)
        lines.push(buffer.getLine(buffer.viewportY + row)?.translateToString(true) ?? "");
      return lines.join("\n");
    },
  };
}
