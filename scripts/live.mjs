import { load } from "./testimonial.mjs";

/** Optional Discord user watched through Lanyard for the "coding now" signal. */
export const DISCORD_ID = process.env.DISCORD_ID ?? "";
/** Timezone that drives the day/night cycle. */
export const TIMEZONE = "America/Sao_Paulo";
/** Activities that count as coding. */
const EDITORS = /visual studio code|^code$|cursor|zed|intellij|webstorm|pycharm|goland|neovim|vim|sublime|windsurf/i;
/** Most visitor cars on the road at once. */
const MAX_CARS = 12;
/** Repos whose commits never go on the billboard. */
const HIDDEN_REPOS = (process.env.BILLBOARD_HIDE ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export function sceneMode(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: TIMEZONE }).format(now));
  return hour >= 6 && hour < 18 ? "day" : "night";
}

export async function presence() {
  if (!DISCORD_ID) return { status: "active", coding: false };
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`);
    const { data } = await res.json();
    const coding = data.activities.some((a) => a.type === 0 && EDITORS.test(a.name));
    return { status: coding ? "coding" : data.discord_status, coding };
  } catch {
    return { status: "offline", coding: false };
  }
}

function ago(date, now = Date.now()) {
  const m = Math.max(1, Math.round((now - new Date(date)) / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

export async function latestCommit(login, token) {
  const gh = async (path) => {
    const res = await fetch(`https://api.github.com/${path}`, { headers: { Authorization: `bearer ${token}`, Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  try {
    const events = await gh(`users/${login}/events/public?per_page=50`);
    for (const e of events) {
      if (e.type !== "PushEvent" || !e.payload?.head) continue;
      if (HIDDEN_REPOS.some((h) => e.repo.name === h || e.repo.name.startsWith(`${h}/`))) continue;
      const c = await gh(`repos/${e.repo.name}/commits/${e.payload.head}`);
      if (c.author?.login !== login) continue;
      return { repo: e.repo.name.split("/")[1], message: c.commit.message.split("\n")[0], ago: ago(c.commit.author.date) };
    }
    const repos = await gh(`users/${login}/repos?sort=pushed&direction=desc&per_page=6`);
    for (const r of repos) {
      if (r.fork) continue;
      if (HIDDEN_REPOS.some((h) => r.full_name === h || r.full_name.startsWith(`${h}/`))) continue;
      const commits = await gh(`repos/${r.full_name}/commits?per_page=5`);
      const c = commits.find((x) => x.author?.login === login || (!x.author?.login && r.owner?.login === login));
      if (!c) continue;
      return { repo: r.name, message: c.commit.message.split("\n")[0], ago: ago(c.commit.author.date) };
    }
  } catch (err) {
    console.warn(`billboard skipped: ${err.message}`);
  }
  return null;
}

export async function visitors() {
  const seen = new Set();
  return (await load()).map((t) => t.login).filter((login) => !seen.has(login.toLowerCase()) && seen.add(login.toLowerCase())).slice(0, MAX_CARS);
}
