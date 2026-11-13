import { mkdir, writeFile } from "node:fs/promises";
import { cityScene, MONO, SANS, wrap } from "./city.mjs";
import { DISCORD_ID, latestCommit, presence, sceneMode, visitors } from "./live.mjs";
import { load, SHOWN } from "./testimonial.mjs";

const LOGIN = process.env.PROFILE_LOGIN ?? "EduardoCoura";
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const OUT = process.env.OUT_DIR ?? "dist";

/** Buttons rendered under the banner, as [file id, label]. */
const BUTTONS = DISCORD_ID
  ? [["testimonial", "leave a testimonial"], ["discord", "discord"]]
  : [["testimonial", "leave a testimonial"]];
/** Status chip text per presence state. */
const STATUS = {
  coding: "coding right now",
  active: "Brazil · active on GitHub",
  online: "online",
  idle: "away",
  dnd: "heads down",
  offline: "offline",
};

const THEMES = {
  dark: {
    bg: "#0d1117",
    border: "#30363d",
    text: "#f0f6fc",
    muted: "#8b949e",
    accent: "#a371f7",
  },
  light: {
    bg: "#ffffff",
    border: "#d0d7de",
    text: "#1f2328",
    muted: "#656d76",
    accent: "#8250df",
  },
};

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

async function fetchProfile() {
  if (!TOKEN) throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(JSON.stringify(json.errors ?? json));
  return json.data.user.contributionsCollection;
}

function summarize(c) {
  const weeks = c.contributionCalendar.weeks.map((w) => w.contributionDays);
  const days = weeks.flat();
  const today = new Date().toISOString().slice(0, 10);
  const past = days.filter((d) => d.date <= today);

  let longest = 0;
  let run = 0;
  for (const d of past) {
    run = d.contributionCount > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let current = 0;
  let i = past.length - 1;
  if (i >= 0 && past[i].contributionCount === 0) i--;
  for (; i >= 0 && past[i].contributionCount > 0; i--) current++;

  return {
    total: c.contributionCalendar.totalContributions,
    commits: c.totalCommitContributions,
    pullRequests: c.totalPullRequestContributions,
    reviews: c.totalPullRequestReviewContributions,
    repositories: c.totalRepositoriesWithContributedCommits,
    current,
    longest,
    activeDays: past.filter((d) => d.contributionCount > 0).length,
    weeks,
    updated: today,
  };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");

function svg({ width, height, title, desc, style, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>${style}
@media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
${body}
</svg>
`;
}

function city(theme, s, live) {
  const T = THEMES[theme];
  const W = 880;
  const H = 560;
  const scene = cityScene(live.mode, s.weeks, { x: 28, y: 40, w: W - 56, h: H - 88 }, live);
  const on = live.status !== "offline";
  const dot = live.coding ? T.accent : { active: T.accent, online: "#22c55e", idle: "#f59e0b", dnd: "#ef4444" }[live.status] ?? T.muted;

  const stats = [
    [fmt(s.repositories), "repositories"],
    [fmt(s.total), "contributions"],
    [`${s.longest} days`, "longest streak"],
  ];
  const statEls = stats.map(([v, l], i) => {
    const x = W - 44 - (stats.length - i) * 150 + 20;
    return `<g class="fade" style="animation-delay:${(1 + i * 0.1).toFixed(2)}s"><text x="${x}" y="${H - 64}" class="num">${esc(v)}</text><text x="${x}" y="${H - 42}" class="cap">${esc(l)}</text></g>`;
  }).join("\n");

  const style = `
.handle { font: 500 13px ${MONO}; fill: ${T.accent}; }
.name { font: 700 46px ${SANS}; fill: ${T.text}; letter-spacing: -1.5px; }
.num { font: 600 26px ${SANS}; fill: ${T.text}; letter-spacing: -.6px; }
.cap { font: 500 11px ${MONO}; fill: ${T.muted}; letter-spacing: 1.2px; text-transform: uppercase; }
.status { font: 500 12px ${MONO}; fill: ${T.muted}; }
.ping { transform-box: fill-box; transform-origin: center; animation: ping 1.8s ease-out infinite; }
.fade { opacity: 0; animation: show .8s ease-out forwards; }
@keyframes ping { from { transform: scale(1); opacity: .7; } to { transform: scale(3); opacity: 0; } }
@keyframes show { to { opacity: 1; } }
${scene.style}`;

  const body = `<defs><clipPath id="card"><rect width="${W}" height="${H}" rx="18"/></clipPath>
${scene.defs}</defs>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="18" fill="${T.bg}" stroke="${T.border}"/>
<g clip-path="url(#card)">${scene.body}</g>
<g class="fade"><text x="44" y="66" class="handle">@${esc(LOGIN)}</text><text x="42" y="116" class="name">Eduardo Coura</text>
<g transform="translate(48 146)">${on ? `<circle class="ping" r="4" fill="${dot}"/>` : ""}<circle r="4" fill="${dot}"/><text x="12" y="4" class="status">${esc(STATUS[live.status] ?? live.status)}${live.visitors.length ? ` · ${live.visitors.length} friend${live.visitors.length === 1 ? "" : "s"} in town` : ""}</text></g></g>
${statEls}`;

  return svg({
    width: W,
    height: H,
    title: "Eduardo Coura",
    desc: `Eduardo Coura. A living isometric city built from the last year of GitHub activity, one building per day: ${fmt(s.repositories)} repositories, ${fmt(s.total)} contributions, longest streak ${s.longest} days.`,
    style,
    body,
  });
}

function button(theme, label, primary) {
  const T = THEMES[theme];
  const W = Math.round(40 + label.length * 8);
  const fill = primary ? T.accent : T.bg;
  const ink = primary ? T.bg : T.text;
  const H = 38;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${fill}" stroke="${primary ? T.accent : T.border}"/>
<circle cx="17" cy="${H / 2}" r="3" fill="${primary ? ink : T.accent}"/>
<style>text { font: ${primary ? 600 : 500} 13px ${MONO}; fill: ${ink}; }</style>
<text x="27" y="${H / 2 + 4.5}">${esc(label)}</text>
</svg>
`;
}

async function avatar(login) {
  try {
    const res = await fetch(`https://avatars.githubusercontent.com/${login}?s=96`);
    if (!res.ok) return null;
    return `data:${res.headers.get("content-type") ?? "image/png"};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

function testimonial(theme, t, img) {
  const T = THEMES[theme];
  const W = 440;
  const H = 210;
  const lines = wrap(t.message, 50, 5);
  const face = img
    ? `<clipPath id="a"><circle cx="54" cy="54" r="22"/></clipPath><image href="${img}" x="32" y="32" width="44" height="44" clip-path="url(#a)"/>`
    : `<circle cx="54" cy="54" r="22" fill="${T.border}"/>`;
  const style = `
.who { font: 600 15px ${SANS}; fill: ${T.text}; }
.meta { font: 500 11px ${MONO}; fill: ${T.muted}; letter-spacing: .4px; }
.msg { font: 400 15px ${SANS}; fill: ${T.text}; }
.quote { font: 700 96px Georgia, serif; fill: ${T.accent}; opacity: .18; }`;
  const body = `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14" fill="${T.bg}" stroke="${T.border}"/>
<text x="${W - 30}" y="88" text-anchor="end" class="quote">”</text>
${face}
<circle cx="54" cy="54" r="22" fill="none" stroke="${T.accent}" stroke-width="1.5"/>
<text x="90" y="50" class="who">@${esc(t.login)}</text>
<text x="90" y="69" class="meta">testimonial · ${esc(t.date)}</text>
${lines.map((line, i) => `<text x="32" y="${110 + i * 21}" class="msg">${esc(line)}</text>`).join("")}`;
  return svg({ width: W, height: H, title: `Testimonial from @${t.login}`, desc: t.message, style, body });
}

const [stats, who, commit, guests] = await Promise.all([fetchProfile().then(summarize), presence(), latestCommit(LOGIN, TOKEN), visitors()]);
const forced = process.env.PRESENCE && { status: process.env.PRESENCE, coding: process.env.PRESENCE === "coding" };
const live = { mode: process.env.SCENE_MODE ?? sceneMode(), ...(forced || who), commit, visitors: guests };
const testimonials = (await load()).slice(0, SHOWN);
const faces = await Promise.all(testimonials.map((t) => avatar(t.login)));
await mkdir(OUT, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  await writeFile(`${OUT}/city-${theme}.svg`, city(theme, stats, live));
  for (const [i, t] of testimonials.entries()) await writeFile(`${OUT}/testimonial-${i}-${theme}.svg`, testimonial(theme, t, faces[i]));
  for (const [id, label] of BUTTONS) await writeFile(`${OUT}/link-${id}-${theme}.svg`, button(theme, label, id === "testimonial"));
}
console.log(`${LOGIN}: ${stats.total} contributions · ${live.mode} · ${live.status} · ${testimonials.length} testimonials · billboard: ${commit ? `${commit.repo} "${commit.message}"` : "none"}`);
