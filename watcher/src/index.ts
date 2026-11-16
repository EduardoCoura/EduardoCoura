export interface Env {
  GH_TOKEN?: string;
  WEBHOOK_SECRET?: string;
  PROFILE_LOGIN?: string;
  PROFILE_REPO?: string;
  TIMEZONE?: string;
}

interface ScheduledController {
  cron: string;
  scheduledTime: number;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const TRACKED_EVENTS = new Set([
  "PushEvent",
  "CreateEvent",
  "PullRequestEvent",
  "ReleaseEvent",
  "IssuesEvent",
]);

const isBot = (name?: string | null): boolean =>
  Boolean(name && (name.endsWith("[bot]") || name === "github-actions[bot]"));

export function sceneMode(date: Date, timeZone: string): "day" | "night" {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(date)
  );
  return hour >= 6 && hour < 18 ? "day" : "night";
}

function ghHeaders(token: string, accept = "application/vnd.github+json"): Record<string, string> {
  return {
    Authorization: `bearer ${token}`,
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "eduardocoura-profile-watcher",
  };
}

async function ghJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`https://api.github.com/${path}`, {
    ...init,
    headers: { ...ghHeaders(token), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function ghText(token: string, path: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/${path}`, {
    headers: ghHeaders(token, "application/vnd.github.raw+json"),
  });
  if (!res.ok) return null;
  return await res.text();
}

async function dispatchProfile(token: string, repo: string, reason: string): Promise<{ ok: boolean; status: number; error?: string }> {
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: { ...ghHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ event_type: "repo-updated", client_payload: { reason } }),
  });
  if (res.ok) return { ok: true, status: res.status };
  return { ok: false, status: res.status, error: await res.text() };
}

async function verifySignature(secret: string, body: string, signatureHeader: string | null): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const expected = `sha256=${Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}

export async function checkAndSync(env: Env, nowTs = Date.now()): Promise<{ action: string; reason?: string }> {
  const token = (env.GH_TOKEN ?? "").trim();
  const login = env.PROFILE_LOGIN ?? "EduardoCoura";
  const repo = env.PROFILE_REPO ?? `${login}/${login}`;
  const timeZone = env.TIMEZONE ?? "America/Sao_Paulo";

  if (!token) {
    return { action: "skipped", reason: "missing GH_TOKEN secret" };
  }

  const runsData = await ghJson<{
    workflow_runs?: Array<{ id: number; status: string; conclusion: string | null; created_at: string }>;
  }>(token, `repos/${repo}/actions/workflows/profile.yml/runs?per_page=1`);

  const latestRun = runsData?.workflow_runs?.[0];
  if (latestRun && (latestRun.status === "queued" || latestRun.status === "in_progress")) {
    return { action: "skipped", reason: `run ${latestRun.id} is ${latestRun.status}` };
  }

  const lastRunTs = latestRun ? new Date(latestRun.created_at).getTime() : 0;
  if (latestRun?.conclusion === "failure" && nowTs - lastRunTs < 30 * 60_000) {
    return { action: "skipped", reason: `recent failure ${latestRun.id}` };
  }

  const [authRepos, publicRepos, profileMainCommit, authEvents, publicEvents, gqlRes, liveSvg] = await Promise.all([
    ghJson<Array<any>>(token, "user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&direction=desc&per_page=15"),
    ghJson<Array<any>>(token, `users/${login}/repos?sort=pushed&direction=desc&per_page=15`),
    ghJson<any>(token, `repos/${repo}/commits/main`),
    ghJson<Array<any>>(token, `users/${login}/events?per_page=20`),
    ghJson<Array<any>>(token, `users/${login}/events/public?per_page=20`),
    ghJson<any>(token, "graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `query($login: String!) {
          user(login: $login) {
            contributionsCollection {
              totalRepositoriesWithContributedCommits
              contributionCalendar { totalContributions }
            }
          }
        }`,
        variables: { login },
      }),
    }),
    ghText(token, `repos/${repo}/contents/city-dark.svg?ref=output`),
  ]);

  const repoMap = new Map<string, any>();
  for (const list of [authRepos, publicRepos]) {
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const k = r?.full_name?.toLowerCase();
      if (k && !repoMap.has(k)) repoMap.set(k, r);
    }
  }

  let reason = "";
  let latestActivityTs = 0;

  for (const r of repoMap.values()) {
    if (r.fork) continue;
    let ts = new Date(r.pushed_at).getTime() || 0;
    if (r.full_name?.toLowerCase() === repo.toLowerCase()) {
      const mainDate = profileMainCommit?.commit?.committer?.date ?? profileMainCommit?.commit?.author?.date;
      ts = mainDate ? new Date(mainDate).getTime() || 0 : 0;
    }
    if (ts > latestActivityTs) latestActivityTs = ts;
    if (!reason && ts > lastRunTs) reason = `repo-push:${r.full_name}`;
  }

  const eventMap = new Map<string, any>();
  for (const list of [authEvents, publicEvents]) {
    if (!Array.isArray(list)) continue;
    for (const e of list) if (e?.id && !eventMap.has(e.id)) eventMap.set(e.id, e);
  }

  for (const e of eventMap.values()) {
    if (isBot(e.actor?.login)) continue;
    if (e.repo?.name?.toLowerCase() === repo.toLowerCase() && e.type === "PushEvent" && e.payload?.ref === "refs/heads/output") {
      continue;
    }
    if (!TRACKED_EVENTS.has(e.type)) continue;
    const ts = new Date(e.created_at).getTime() || 0;
    if (ts > latestActivityTs) latestActivityTs = ts;
    if (!reason && ts > lastRunTs) reason = `event:${e.type}:${e.repo?.name ?? ""}`;
  }

  const cc = gqlRes?.data?.user?.contributionsCollection;
  if (!reason && cc && liveSvg && nowTs - lastRunTs > 20 * 60_000) {
    const m = liveSvg.match(/(\d[\d,]*)\s+repositories,\s+(\d[\d,]*)\s+contributions/);
    if (m) {
      const svgRepos = Number(m[1].replaceAll(",", ""));
      const svgContribs = Number(m[2].replaceAll(",", ""));
      const apiRepos = Number(cc.totalRepositoriesWithContributedCommits);
      const apiContribs = Number(cc.contributionCalendar?.totalContributions);
      if (svgContribs !== apiContribs || (svgRepos !== apiRepos && nowTs - lastRunTs > 60 * 60_000)) {
        reason = `stats-drift:${svgRepos}->${apiRepos},${svgContribs}->${apiContribs}`;
      }
    }
  }

  if (!reason && lastRunTs > 0 && sceneMode(new Date(lastRunTs), timeZone) !== sceneMode(new Date(nowTs), timeZone)) {
    reason = `scene-mode:${sceneMode(new Date(nowTs), timeZone)}`;
  }

  if (!reason && latestActivityTs > 0 && nowTs - latestActivityTs < 6 * 3600_000 && nowTs - lastRunTs > 45 * 60_000) {
    reason = "refresh-recent-ago";
  }

  if (!reason) {
    return { action: "noop", reason: `up to date (${latestRun?.created_at ?? "none"})` };
  }

  const dispatched = await dispatchProfile(token, repo, reason);
  if (!dispatched.ok) {
    throw new Error(`Dispatch failed (${dispatched.status}): ${dispatched.error ?? ""}`);
  }
  return { action: "dispatched", reason };
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    const result = await checkAndSync(env);
    console.log(JSON.stringify(result));
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, login: env.PROFILE_LOGIN ?? "EduardoCoura" });
    }

    if (request.method === "POST" && url.pathname === "/webhook") {
      const token = (env.GH_TOKEN ?? "").trim();
      const login = env.PROFILE_LOGIN ?? "EduardoCoura";
      const repo = env.PROFILE_REPO ?? `${login}/${login}`;
      if (!token) return Response.json({ ok: false, error: "GH_TOKEN not configured" }, { status: 500 });

      const rawBody = await request.text();
      if (env.WEBHOOK_SECRET) {
        const sig = request.headers.get("X-Hub-Signature-256");
        const bearer = request.headers.get("Authorization");
        const okSig = sig ? await verifySignature(env.WEBHOOK_SECRET, rawBody, sig) : false;
        const okBearer = bearer === `Bearer ${env.WEBHOOK_SECRET}`;
        if (!okSig && !okBearer) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const ghEvent = request.headers.get("X-GitHub-Event") ?? "webhook";
      let payload: any = {};
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        payload = {};
      }
      if (isBot(payload?.sender?.login)) {
        return Response.json({ ok: true, action: "ignored", reason: "bot sender" });
      }
      if (
        ghEvent === "push" &&
        payload?.repository?.full_name?.toLowerCase() === repo.toLowerCase() &&
        payload?.ref === "refs/heads/output"
      ) {
        return Response.json({ ok: true, action: "ignored", reason: "output branch deploy" });
      }

      const reason = `webhook:${ghEvent}:${payload?.repository?.full_name ?? ""}`;
      ctx.waitUntil(dispatchProfile(token, repo, reason));
      return Response.json({ ok: true, action: "queued", reason }, { status: 202 });
    }

    return Response.json({ ok: false, error: "Not found" }, { status: 404 });
  },
};
