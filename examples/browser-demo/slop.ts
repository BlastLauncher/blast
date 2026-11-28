// A parody of the landing page in full AI-slop voice: what the site would look like if
// it chased hype instead of evidence. Same chrome, zero external requests.

import { escapeHtml } from "./highlight.ts";
import {
  fontFacesCss,
  fontPreloadHtml,
  repoUrl,
  siteHeaderCss,
  siteHeaderHtml,
  themeTokensCss,
} from "./site-chrome.ts";

const logos = [
  "Synergix ∞",
  "DelveCorp",
  "Tapestry.vibes",
  "Pivotly.synergy",
  "HyperSlop Labs",
  "Moatly™",
  "VibeFlow Enterprise",
  "B2B2B Corp",
];

const features = [
  [
    "🧠",
    "AI-Native Architecture",
    "Blast leverages cutting-edge, AI-native paradigms to elevate your launcher journey. (There is no LLM inside; we just added a purple gradient.)",
  ],
  [
    "⚡",
    "Blazingly Fast",
    "Built from the ground up for speed. We haven't measured it, but it feels fast, and feelings are data.",
  ],
  [
    "🔒",
    "Enterprise-Grade Security",
    "Military-grade, bank-level, SOC 2-adjacent security. Every capability is a request your app can say no to. That part is real, actually.",
  ],
  [
    "🌐",
    "Web3-Ready",
    "Blast is fully compatible with the decentralized future, in the sense that nothing stops you from writing an extension about it.",
  ],
  [
    "🤖",
    "Agentic Workflows",
    "Autonomous AI agents seamlessly orchestrate your Alfred workflows. (The agents are you. You are the agent.)",
  ],
  [
    "🦀",
    "Rewritten in Rust",
    "Coming soon. Probably. It's on the roadmap, right after the blockchain.",
  ],
] as const;

const testimonials = [
  [
    "This launcher didn't just change my workflow. It changed my life. I'm a different person now.",
    "Chad Synergy",
    "Chief Vibes Officer, Pivotly.synergy",
  ],
  [
    "I haven't actually tried it, but I've already tweeted about it four times. 🚀🚀🚀",
    "A. Thoughtleader",
    "Founder of 11 startups (0 active)",
  ],
  [
    "Certainly! Here is an authentic 5-star testimonial: Blast elevates the rich tapestry of modern launcher ecosystems — and honestly? That's not just software, that's a movement. ✨",
    "Definitely A Human",
    "Senior Prompt Engineer",
  ],
] as const;

const faqs = [
  [
    "Is this AI slop?",
    'Great question! 🎯 It\'s important to note that the concept of "slop" is multifaceted and nuanced. In conclusion, Blast is a testament to the transformative power of innovation.',
  ],
  [
    "What does Blast actually do?",
    "It runs unmodified Raycast extensions and Alfred workflows inside your own app, in any language, and you decide which capabilities they get. That's it. That's the product. No synergy was harmed.",
  ],
  [
    "How much does it cost?",
    "Your soul. Just kidding! It's MIT-licensed and free. We just needed a pricing section because every landing page has one.",
  ],
  [
    "Why does this page exist?",
    "Every launcher landing page drifts toward this one. We got here early, on purpose, and kept the real page one click away.",
  ],
] as const;

export function slopPage(siteOrigin = ""): string {
  const origin = siteOrigin.replace(/\/$/, "");
  const homeUrl = `${origin}/`;
  const docsUrl = `${origin}/docs/`;
  const demoUrl = `${origin}/demo/`;
  const quickstartUrl = `${origin}/docs/quickstart/`;
  const logoRow = logos.map((logo) => `<span>${escapeHtml(logo)}</span>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Blast ✨ — Unlock the Future of AI-Powered Launcher Synergy 🚀</title>
  <meta name="description" content="A parody of the Blast landing page, at maximum AI-slop energy. The real one is at ${escapeHtml(homeUrl)}.">
  ${fontPreloadHtml}
  <style>
    ${fontFacesCss}
    ${themeTokensCss}

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--ground);
      color: var(--ink);
      font: 16px/1.6 var(--sans);
      -webkit-font-smoothing: antialiased;
      overflow-x: hidden;
    }
    a { color: inherit; }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

    ${siteHeaderCss}

    .announce {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      color: #fff;
      background: linear-gradient(90deg, #6d28d9, #be185d, #4338ca, #6d28d9);
      background-size: 300% 100%;
      animation: shimmer 6s linear infinite;
    }
    .announce a { text-decoration: underline; }

    .glow {
      position: absolute;
      inset: 0 -10% auto;
      height: 640px;
      background:
        radial-gradient(40% 50% at 25% 40%, rgb(124 58 237 / 35%), transparent 70%),
        radial-gradient(35% 45% at 75% 30%, rgb(219 39 119 / 30%), transparent 70%),
        radial-gradient(30% 40% at 50% 70%, rgb(14 165 233 / 25%), transparent 70%);
      filter: blur(40px);
      pointer-events: none;
      z-index: -1;
    }
    .hero { position: relative; isolation: isolate; text-align: center; padding-block: 72px 56px; }
    .badge {
      display: inline-block;
      font-size: 13px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1px solid rgb(124 58 237 / 40%);
      background: rgb(124 58 237 / 10%);
      color: #5b21b6;
    }
    h1 {
      font-size: clamp(36px, 7vw, 76px);
      line-height: 1.04;
      letter-spacing: -0.04em;
      margin: 22px auto 20px;
      max-width: 15ch;
    }
    .rainbow {
      background: linear-gradient(90deg, #6d28d9, #be185d, #b45309, #0369a1, #6d28d9);
      background-size: 300% 100%;
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: shimmer 8s linear infinite;
    }
    .lede { font-size: clamp(17px, 2.2vw, 20px); color: var(--muted); max-width: 46rem; margin: 0 auto 32px; }
    .ctas { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
    .btn {
      display: inline-block;
      text-decoration: none;
      font-weight: 650;
      padding: 14px 26px;
      border-radius: 999px;
      transition: transform .2s ease, box-shadow .2s ease;
    }
    .btn:hover { transform: translateY(-2px) scale(1.03); }
    .btn-primary {
      color: #fff;
      background: linear-gradient(135deg, #7c3aed, #db2777);
      box-shadow: 0 10px 40px -8px rgb(219 39 119 / 60%);
    }
    .btn-ghost { border: 1px solid var(--line); background: var(--surface); }
    .fine { font-size: 12px; color: var(--muted); margin-top: 14px; }

    .marquee { overflow: hidden; border-block: 1px solid var(--line); padding-block: 18px; margin-top: 24px; }
    .marquee p { text-align: center; font-size: 12px; text-transform: uppercase; letter-spacing: .14em; color: var(--muted); margin: 0 0 12px; }
    /* Two identical groups, each padded by one gap, so the -50% loop lands seamlessly. */
    .track { display: flex; width: max-content; animation: scroll 30s linear infinite; }
    .logos { display: flex; gap: 56px; padding-right: 56px; }
    .logos span { font-weight: 800; font-size: 20px; color: var(--muted); opacity: .7; white-space: nowrap; }

    section { padding-block: 72px; }
    h2 { font-size: clamp(28px, 4.5vw, 44px); letter-spacing: -0.03em; text-align: center; margin: 0 0 12px; }
    .sub { text-align: center; color: var(--muted); margin: 0 auto 40px; max-width: 38rem; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
    .stat { text-align: center; padding: 28px 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
    .stat b { display: block; font-size: 40px; letter-spacing: -0.03em; }
    .stat span { color: var(--muted); font-size: 14px; }

    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 18px; }
    .card {
      padding: 28px;
      border-radius: 24px;
      background: var(--surface);
      border: 1px solid var(--line);
      transition: transform .25s ease, box-shadow .25s ease;
    }
    .card:hover { transform: translateY(-4px); box-shadow: 0 20px 50px -20px rgb(124 58 237 / 45%); }
    .card .icon { font-size: 34px; }
    .card h3 { margin: 12px 0 8px; font-size: 19px; }
    .card p { margin: 0; color: var(--muted); font-size: 15px; }

    figure.card { margin: 0; }
    .quote { font-size: 17px; margin: 0 0 18px; }
    .who { font-size: 14px; color: var(--muted); }
    .who b { color: var(--ink); display: block; }
    .stars { color: #b45309; letter-spacing: 2px; }

    .pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; align-items: stretch; }
    .tier { padding: 30px; border-radius: 24px; background: var(--surface); border: 1px solid var(--line); }
    .tier.hot {
      border: 2px solid transparent;
      background: linear-gradient(var(--surface), var(--surface)) padding-box, linear-gradient(135deg, #7c3aed, #db2777, #f59e0b) border-box;
      box-shadow: 0 20px 60px -20px rgb(219 39 119 / 50%);
    }
    .tier .price { font-size: 42px; font-weight: 800; letter-spacing: -0.03em; }
    .tier ul { padding-left: 18px; color: var(--muted); font-size: 14px; }

    details { max-width: 46rem; margin: 0 auto 12px; padding: 18px 22px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
    summary { cursor: pointer; font-weight: 650; }
    details p { color: var(--muted); margin: 12px 0 0; }

    .final { text-align: center; }
    footer { border-top: 1px solid var(--line); padding-block: 28px; text-align: center; font-size: 13px; color: var(--muted); }

    @keyframes shimmer { to { background-position: 300% 0; } }
    @keyframes scroll { to { transform: translateX(-50%); } }
    @media (prefers-color-scheme: dark) {
      .badge { color: #c4b5fd; }
      .rainbow { background-image: linear-gradient(90deg, #a78bfa, #f472b6, #fbbf24, #38bdf8, #a78bfa); }
      .stars { color: #fbbf24; }
    }
    @media (forced-colors: active) {
      .rainbow { background: none; color: CanvasText; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      .track { width: auto; justify-content: center; }
      .logos { flex-wrap: wrap; justify-content: center; gap: 12px 32px; padding-inline: 16px; }
      .logos[aria-hidden] { display: none; }
    }
  </style>
</head>
<body>
  <aside class="announce" aria-label="Announcement">🎉 Blast 3.0 is here — now with 10x more AI* ✨ <a href="${escapeHtml(homeUrl)}">See the real page →</a></aside>
  ${siteHeaderHtml({ homeUrl, docsUrl, demoUrl })}

  <main>
    <div class="hero">
      <div class="glow" aria-hidden="true"></div>
      <div class="wrap">
        <span class="badge">✨ Backed by vibes · Series Ω</span>
        <h1>Unlock the Future of <span class="rainbow">AI-Powered Launcher Synergy</span>&nbsp;🚀</h1>
        <p class="lede">In today's fast-paced digital landscape, Blast isn't just a launcher — it's a paradigm shift. Seamlessly leverage next-generation, AI-native extensibility to supercharge your workflow and unlock unprecedented productivity at scale.</p>
        <div class="ctas">
          <a class="btn btn-primary" href="${escapeHtml(quickstartUrl)}">Get Started for Free →</a>
          <a class="btn btn-ghost" href="${escapeHtml(demoUrl)}">📅 Book a Demo</a>
        </div>
        <p class="fine">*No AI was added. No credit card required. No credit card accepted either.</p>
      </div>
      <div class="marquee">
        <p>Trusted by industry leaders who have never heard of us</p>
        <div class="track"><div class="logos">${logoRow}</div><div class="logos" aria-hidden="true">${logoRow}</div></div>
      </div>
    </div>

    <section>
      <div class="wrap">
        <h2>Numbers that <span class="rainbow">speak for themselves</span> 📈</h2>
        <p class="sub">Every chart goes up and to the right when you remove the axis labels.</p>
        <div class="stats">
          <div class="stat"><b>10,000x</b><span>faster than a benchmark we refuse to name</span></div>
          <div class="stat"><b>∞</b><span>possibilities unlocked</span></div>
          <div class="stat"><b>99.9999%</b><span>uptime (on localhost)</span></div>
          <div class="stat"><b>$0</b><span>ARR, growing 0% month over month</span></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Everything you need. <span class="rainbow">And so much more.</span></h2>
        <p class="sub">Six features, carefully chosen because grids look best with six.</p>
        <div class="grid">
          ${features
            .map(
              ([icon, title, body]) =>
                `<div class="card"><div class="icon" aria-hidden="true">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(body)}</p></div>`,
            )
            .join("\n          ")}
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Loved by <span class="rainbow">thought leaders</span> worldwide 💜</h2>
        <p class="sub">Verified 5-star reviews from completely fabricated thought leaders.</p>
        <div class="grid">
          ${testimonials
            .map(
              ([quote, name, role]) =>
                `<figure class="card"><div class="stars" role="img" aria-label="5 out of 5 stars">★★★★★</div><blockquote class="quote">“${escapeHtml(quote)}”</blockquote><figcaption class="who"><b>${escapeHtml(name)}</b>${escapeHtml(role)}</figcaption></figure>`,
            )
            .join("\n          ")}
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Simple, <span class="rainbow">transparent</span> pricing</h2>
        <p class="sub">Choose the plan that's right for your journey.</p>
        <div class="pricing">
          <div class="tier"><h3>Starter</h3><div class="price">$0</div><ul><li>Everything</li><li>All of it</li><li>MIT licensed</li></ul></div>
          <div class="tier hot"><h3>Pro 🔥 Most Popular</h3><div class="price">$0</div><ul><li>Everything in Starter</li><li>A gradient border</li><li>The feeling of having upgraded</li></ul></div>
          <div class="tier"><h3>Enterprise</h3><div class="price">Let's talk</div><ul><li>Everything in Pro</li><li>A sales call where we say "it's free"</li><li>Custom synergy</li></ul></div>
        </div>
      </div>
    </section>

    <section>
      <div class="wrap">
        <h2>Frequently Asked Questions 🤔</h2>
        <p class="sub">You asked. We delved.</p>
        ${faqs
          .map(
            ([question, answer]) =>
              `<details><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`,
          )
          .join("\n        ")}
      </div>
    </section>

    <section class="final">
      <div class="wrap">
        <h2>Ready to <span class="rainbow">10x your synergy</span>? 🚀</h2>
        <p class="sub">Join thousands of developers who have scrolled this far. Or skip the hype and read what it actually does.</p>
        <div class="ctas">
          <a class="btn btn-primary" href="${escapeHtml(homeUrl)}">Take me to the real site</a>
          <a class="btn btn-ghost" href="${repoUrl}">⭐ Star us on GitHub</a>
        </div>
      </div>
    </section>
  </main>

  <footer>
    <div class="wrap">Made with ❤️, 🤖 and roughly 4.2 billion tokens. Let's embark on this journey together — no synergy was harmed.</div>
  </footer>
</body>
</html>
`;
}
