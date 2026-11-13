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
  const ghOptional = (path) => gh(path).catch(() => null);
  const lowerLogin = login.toLowerCase();
  const isHidden = (fullName) => HIDDEN_REPOS.some((h) => fullName === h || fullName.startsWith(`${h}/`));
  const isProfileRepo = (fullName) => fullName.toLowerCase() === `${lowerLogin}/${lowerLogin}`;
  const matchesAuthor = (c, ownerLogin) =>
    c?.author?.login?.toLowerCase() === lowerLogin ||
    c?.committer?.login?.toLowerCase() === lowerLogin ||
    (!c?.author?.login && ownerLogin?.toLowerCase() === lowerLogin);
  const toBillboard = (repoName, c) => {
    const date = c?.commit?.author?.date ?? c?.commit?.committer?.date;
    return {
      repo: repoName,
      message: String(c.commit.message || "").split(/\r?\n/)[0],
      ago: ago(date),
      ts: new Date(date).getTime() || 0,
    };
  };

  try {
    const [eventsRes, reposRes] = await Promise.all([
      ghOptional(`users/${login}/events/public?per_page=50`),
      ghOptional(`users/${login}/repos?sort=pushed&direction=desc&per_page=10`),
    ]);
    const events = Array.isArray(eventsRes) ? eventsRes : [];
    const repos = Array.isArray(reposRes) ? reposRes : [];

    const pickFromEvents = async (allowProfileRepo) => {
      for (const e of events) {
        if (e.type !== "PushEvent" || !e.payload?.head) continue;
        if (isHidden(e.repo.name)) continue;
        if (!allowProfileRepo && isProfileRepo(e.repo.name)) continue;
        const c = await ghOptional(`repos/${e.repo.name}/commits/${e.payload.head}`);
        if (!c || !matchesAuthor(c, e.repo.name.split("/")[0])) continue;
        return toBillboard(e.repo.name.split("/")[1], c);
      }
      return null;
    };

    const pickFromRepos = async (allowProfileRepo, minTs = 0) => {
      for (const r of repos) {
        if (r.fork) continue;
        if (isHidden(r.full_name)) continue;
        if (!allowProfileRepo && isProfileRepo(r.full_name)) continue;
        if (minTs && new Date(r.pushed_at).getTime() <= minTs) break;
        const commits = await ghOptional(`repos/${r.full_name}/commits?per_page=5`);
        if (!Array.isArray(commits)) continue;
        const c = commits.find((x) => matchesAuthor(x, r.owner?.login));
        if (!c) continue;
        return toBillboard(r.name, c);
      }
      return null;
    };

    // Prefer real project repositories over the profile repo itself (`login/login`)
    // so editing the profile README/city scripts does not replace the active project billboard.
    for (const allowProfileRepo of [false, true]) {
      const fromEvent = await pickFromEvents(allowProfileRepo);
      const fromRepo = await pickFromRepos(allowProfileRepo, fromEvent?.ts ?? 0);
      const best = fromRepo && (!fromEvent || fromRepo.ts >= fromEvent.ts) ? fromRepo : fromEvent;
      if (best) return { repo: best.repo, message: best.message, ago: best.ago };
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
