import { readFile, writeFile } from "node:fs/promises";

const DATA = "data/testimonials.json";
const README = "README.md";
const REPO = process.env.GITHUB_REPOSITORY ?? "EduardoCoura/EduardoCoura";
const RAW = `https://raw.githubusercontent.com/${REPO}/output`;
/** Testimonials shown on the profile; older ones stay in the data file. */
export const SHOWN = 6;
/** Longest message kept, in characters. */
export const MAX_LENGTH = 240;

const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function load() {
  try {
    return JSON.parse(await readFile(DATA, "utf8"));
  } catch {
    return [];
  }
}

function parse(body) {
  const text = body
    .replace(/^###\s*Message\s*/i, "")
    .replace(/_No response_/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return [...text].length > MAX_LENGTH ? `${[...text].slice(0, MAX_LENGTH - 1).join("")}…` : text;
}

function section(list) {
  const cards = list.slice(0, SHOWN).map((t, i) => {
    const alt = attr(`Testimonial from @${t.login}: ${t.message}`);
    return `  <a href="https://github.com/${t.login}"><picture><source media="(prefers-color-scheme: dark)" srcset="${RAW}/testimonial-${i}-dark.svg" /><source media="(prefers-color-scheme: light)" srcset="${RAW}/testimonial-${i}-light.svg" /><img alt="${alt}" src="${RAW}/testimonial-${i}-light.svg" width="49%" /></picture></a>`;
  });
  return cards.length ? `<p align="center">\n${cards.join("\n")}\n</p>` : "";
}

export async function approve({ login, body, issue }) {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(login ?? "")) throw new Error(`invalid login: ${login}`);
  const message = parse(body ?? "");
  if (!message) throw new Error("empty testimonial");

  const list = [{ login, message, date: new Date().toISOString().slice(0, 10), issue: Number(issue) }, ...(await load())];
  await writeFile(DATA, `${JSON.stringify(list, null, 2)}\n`);

  const readme = await readFile(README, "utf8");
  const next = readme.replace(/<!-- testimonials:start -->[\s\S]*<!-- testimonials:end -->/, `<!-- testimonials:start -->\n${section(list)}\n<!-- testimonials:end -->`);
  await writeFile(README, next);
  console.log(`approved testimonial from @${login} (${list.length} total)`);
}
