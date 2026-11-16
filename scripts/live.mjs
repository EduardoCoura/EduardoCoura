import { load } from "./testimonial.mjs";

/** Optional Discord user watched through Lanyard for the "coding now" signal. */
export const DISCORD_ID = process.env.DISCORD_ID ?? "";
/** Timezone that drives the day/night cycle. */
export const TIMEZONE = "America/Sao_Paulo";
/** Activities that count as coding. */
const EDITORS = /visual studio code|^code$|cursor|zed|intellij|webstorm|pycharm|goland|neovim|vim|sublime|windsurf/i;
/** Most visitor cars on the road at once. */
const MAX_CARS = 12;
/** Repos whose activity never goes on the billboard. */
const HIDDEN_REPOS = (process.env.BILLBOARD_HIDE ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const NON_CONTENT_BRANCHES = new Set(["output", "gh-pages"]);

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

const isBot = (name) => Boolean(name && (name.endsWith("[bot]") || name === "github-actions[bot]"));

export async function latestCommit(login, rawToken) {
  const token = rawToken?.trim();
  const gh = async (path) => {
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `bearer ${token}`;
    const res = await fetch(`https://api.github.com/${path}`, { headers });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return res.json();
  };
  const ghOptional = (path) => gh(path).catch(() => null);
  const lowerLogin = login.toLowerCase();
  const isHidden = (fullName) => HIDDEN_REPOS.some((h) => fullName === h || fullName.startsWith(`${h}/`));
  const isProfileRepo = (fullName) => fullName.toLowerCase() === `${lowerLogin}/${lowerLogin}`;
  const matchesAuthor = (c, ownerLogin) => {
    const authorLogin = c?.author?.login;
    const committerLogin = c?.committer?.login;
    if (isBot(authorLogin) || isBot(c?.commit?.author?.name)) return false;
    if (authorLogin?.toLowerCase() === lowerLogin) return true;
    if (committerLogin?.toLowerCase() === lowerLogin) return true;
    return !authorLogin && ownerLogin?.toLowerCase() === lowerLogin && !isBot(committerLogin);
  };
  const toBillboard = (kind, repoName, message, date) => {
    const ts = new Date(date).getTime() || 0;
    return {
      kind,
      repo: repoName,
      message: String(message || "").split(/\r?\n/)[0].trim() || repoName,
      ago: ago(date),
      ts,
    };
  };

  try {
    const [authEventsRes, publicEventsRes, authReposRes, publicReposRes] = await Promise.all([
      ghOptional(`users/${login}/events?per_page=50`),
      ghOptional(`users/${login}/events/public?per_page=50`),
      ghOptional(`user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=25`),
      ghOptional(`users/${login}/repos?sort=pushed&direction=desc&per_page=25`),
    ]);

    const eventMap = new Map();
    for (const list of [authEventsRes, publicEventsRes]) {
      if (!Array.isArray(list)) continue;
      for (const e of list) if (e?.id && !eventMap.has(e.id)) eventMap.set(e.id, e);
    }
    const events = [...eventMap.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const repoMap = new Map();
    for (const list of [authReposRes, publicReposRes]) {
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const key = r?.full_name?.toLowerCase();
        if (key && !repoMap.has(key)) repoMap.set(key, r);
      }
    }
    const repos = [...repoMap.values()].sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));

    const pickCommitFromEvents = async () => {
      for (const e of events) {
        if (e.type !== "PushEvent" || !e.payload?.head || !e.repo?.name) continue;
        if (isHidden(e.repo.name) || isBot(e.actor?.login)) continue;
        const refBranch = String(e.payload?.ref ?? "").replace(/^refs\/heads\//, "");
        if (isProfileRepo(e.repo.name) && NON_CONTENT_BRANCHES.has(refBranch)) continue;
        const c = await ghOptional(`repos/${e.repo.name}/commits/${e.payload.head}`);
        if (!c || !matchesAuthor(c, e.repo.name.split("/")[0])) continue;
        return toBillboard("latest commit", e.repo.name.split("/")[1], c.commit.message, c?.commit?.committer?.date ?? c?.commit?.author?.date ?? e.created_at);
      }
      return null;
    };

    const latestRepoCommit = async (r) => {
      const ownerLogin = r.owner?.login;
      const profileRepo = isProfileRepo(r.full_name);
      let best = null;
      const consider = (c) => {
        if (!c || !matchesAuthor(c, ownerLogin)) return;
        const date = c?.commit?.committer?.date ?? c?.commit?.author?.date;
        const cand = toBillboard("latest commit", r.name, c.commit.message, date);
        if (!best || cand.ts > best.ts) best = cand;
      };

      const commits = await ghOptional(`repos/${r.full_name}/commits?per_page=5`);
      if (Array.isArray(commits)) consider(commits.find((x) => matchesAuthor(x, ownerLogin)));

      // If pushed_at is newer than the default branch commit (push went to another branch), inspect repo events/branches.
      const pushedAt = new Date(r.pushed_at).getTime() || 0;
      if (!best || pushedAt - best.ts > 120_000) {
        const repoEvents = await ghOptional(`repos/${r.full_name}/events?per_page=10`);
        if (Array.isArray(repoEvents)) {
          for (const e of repoEvents) {
            if (e.type !== "PushEvent" || !e.payload?.head) continue;
            const refBranch = String(e.payload?.ref ?? "").replace(/^refs\/heads\//, "");
            if (profileRepo && NON_CONTENT_BRANCHES.has(refBranch)) continue;
            consider(await ghOptional(`repos/${r.full_name}/commits/${e.payload.head}`));
            if (best && pushedAt - best.ts <= 120_000) break;
          }
        }
      }
      if (!best || pushedAt - best.ts > 120_000) {
        const branches = await ghOptional(`repos/${r.full_name}/branches?per_page=10`);
        if (Array.isArray(branches)) {
          const others = branches
            .filter((b) => b.name !== r.default_branch && b.commit?.sha && !(profileRepo && NON_CONTENT_BRANCHES.has(b.name)))
            .slice(0, 5);
          const tipCommits = await Promise.all(others.map((b) => ghOptional(`repos/${r.full_name}/commits/${b.commit.sha}`)));
          for (const c of tipCommits) consider(c);
        }
      }
      return best;
    };

    const pickCommitFromRepos = async (minTs = 0) => {
      let best = null;
      for (const r of repos) {
        if (r.fork || isHidden(r.full_name)) continue;
        const cutoff = Math.max(minTs, best?.ts ?? 0);
        if (cutoff && new Date(r.pushed_at).getTime() <= cutoff) break;
        const cand = await latestRepoCommit(r);
        if (cand && (!best || cand.ts > best.ts)) best = cand;
      }
      return best;
    };

    const pickActionFromEvents = async () => {
      for (const e of events) {
        if (!e.repo?.name || isHidden(e.repo.name) || isBot(e.actor?.login)) continue;
        if (e.actor?.login?.toLowerCase() !== lowerLogin) continue;
        const repoShort = e.repo.name.split("/")[1];

        if (e.type === "ReleaseEvent") {
          const rel = e.payload?.release;
          return toBillboard("release", repoShort, rel?.name || rel?.tag_name || "Published release", e.created_at);
        }
        if (e.type === "PullRequestEvent") {
          const num = e.payload?.number ?? e.payload?.pull_request?.number;
          let pr = e.payload?.pull_request;
          if (!pr?.title && num) pr = await ghOptional(`repos/${e.repo.name}/pulls/${num}`);
          const verb = pr?.merged ? "merged" : e.payload?.action;
          const label = [verb, num ? `#${num}` : "", pr?.title].filter(Boolean).join(" ");
          return toBillboard("pull request", repoShort, label || "Pull request", e.created_at);
        }
        if (e.type === "IssuesEvent") {
          const iss = e.payload?.issue;
          const label = [e.payload?.action, iss?.number ? `#${iss.number}` : "", iss?.title].filter(Boolean).join(" ");
          return toBillboard("issue", repoShort, label || "Issue activity", e.created_at);
        }
        if (e.type === "CreateEvent") {
          const refType = e.payload?.ref_type ?? "repository";
          const refName = e.payload?.ref;
          if (isProfileRepo(e.repo.name) && refType === "branch" && NON_CONTENT_BRANCHES.has(refName)) continue;
          if (refType === "repository") {
            return toBillboard("new repo", repoShort, e.payload?.description || "Created repository", e.created_at);
          }
          return toBillboard(`new ${refType}`, repoShort, refName || `Created ${refType}`, e.created_at);
        }
      }
      const newestEmpty = repos.find((r) => !r.fork && !isHidden(r.full_name));
      return newestEmpty ? toBillboard("new repo", newestEmpty.name, newestEmpty.description || "Created repository", newestEmpty.created_at) : null;
    };

    const [eventCommit, repoCommit, latestAction] = await Promise.all([
      pickCommitFromEvents(),
      pickCommitFromRepos(),
      pickActionFromEvents(),
    ]);
    const bestCommit = repoCommit && (!eventCommit || repoCommit.ts >= eventCommit.ts) ? repoCommit : eventCommit;

    let chosen = bestCommit;
    if (!chosen || (latestAction && latestAction.ts - chosen.ts > 60_000)) {
      chosen = latestAction ?? chosen;
    }
    if (chosen) return { kind: chosen.kind, repo: chosen.repo, message: chosen.message, ago: chosen.ago };
  } catch (err) {
    console.warn(`billboard skipped: ${err.message}`);
  }
  return null;
}

export async function visitors() {
  const seen = new Set();
  return (await load()).map((t) => t.login).filter((login) => !seen.has(login.toLowerCase()) && seen.add(login.toLowerCase())).slice(0, MAX_CARS);
}
