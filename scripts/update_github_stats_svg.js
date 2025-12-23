// scripts/update_github_stats_svg.js
// CommonJS - compatibile senza "type: module" e senza .mjs
// Node 20+ (fetch globale)

const fs = require("node:fs/promises");

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("Missing GITHUB_TOKEN env var.");
  process.exit(1);
}

const USERNAME =
  process.env.USERNAME ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split("/")[0] : null);

if (!USERNAME) {
  console.error("Unable to determine USERNAME. Set USERNAME env.");
  process.exit(1);
}

const SVG_PATH = process.env.SVG_PATH || "assets/about.svg";
const API = "https://api.github.com";

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "update-github-stats-svg",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API error ${res.status} for ${url}: ${text}`);
  }
  return res.json();
}

// Endpoint stats a volte ritorna 202 (calcolo in corso)
async function ghStatsJson(url, { retries = 10, delayMs = 1500 } = {}) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { headers });
    if (res.status === 202) {
      if (i === retries) return null;
      await sleep(delayMs);
      continue;
    }
    if (!res.ok) return null;
    return res.json();
  }
  return null;
}

function sumCommits52w(commitActivity) {
  if (!Array.isArray(commitActivity)) return 0;
  return commitActivity.reduce((acc, w) => acc + (w?.total ?? 0), 0);
}

function sumCodeFreq52w(codeFreq) {
  if (!Array.isArray(codeFreq)) return { add: 0, del: 0 };

  const nowSec = Math.floor(Date.now() / 1000);
  const cutoff = nowSec - 52 * 7 * 24 * 3600;

  let add = 0;
  let del = 0;

  for (const row of codeFreq) {
    if (!Array.isArray(row) || row.length < 3) continue;
    const [week, a, d] = row;
    if (typeof week !== "number" || week < cutoff) continue;
    if (typeof a === "number") add += a;
    if (typeof d === "number") del += Math.abs(d); // deletions negative
  }
  return { add, del };
}

function formatInt(n) {
  return new Intl.NumberFormat("en-US").format(Math.trunc(n));
}

function replaceTspanById(svg, id, newText) {
  const re = new RegExp(`(<tspan[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</tspan>)`, "m");
  if (!re.test(svg)) {
    console.warn(`Warning: tspan id="${id}" not found.`);
    return svg;
  }
  const escaped = String(newText)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return svg.replace(re, `$1${escaped}$3`);
}

function getTspanInner(svg, id) {
  const re = new RegExp(`<tspan[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</tspan>`, "m");
  const m = svg.match(re);
  return m ? m[1] : null;
}

function setTspanInner(svg, id, inner) {
  const re = new RegExp(`(<tspan[^>]*\\bid="${id}"[^>]*>)([\\s\\S]*?)(</tspan>)`, "m");
  if (!re.test(svg)) return svg;
  return svg.replace(re, `$1${inner}$3`);
}

// Trasforma un pezzo di SVG in testo "visibile" (euristica sufficiente qui)
function stripTagsToText(s) {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Riallinea i puntini per fare in modo che l'inizio dei valori (tspan valueId)
 * cada sempre nella stessa "colonna" (monospace).
 *
 * lines: [{ dotsId, valueId }]
 */
function adjustDotsToAlignValues(svg, lines) {
  const infos = [];

  for (const { dotsId, valueId } of lines) {
    const dotsInner = getTspanInner(svg, dotsId);
    const valueInner = getTspanInner(svg, valueId);
    if (dotsInner == null || valueInner == null) continue;

    // Trova il punto nel documento in cui appare il dots tspan
    const idxDots = svg.indexOf(`id="${dotsId}"`);
    if (idxDots === -1) continue;

    // Prendi un contesto prima dei dots (abbastanza grande)
    const start = Math.max(0, idxDots - 900);
    const chunk = svg.slice(start, idxDots);

    // Cerca l'ultimo "inizio riga" (il tspan con x=30 y=...)
    const anchor = chunk.lastIndexOf('<tspan x="30" y="');
    const prefixChunk = anchor !== -1 ? chunk.slice(anchor) : chunk;

    const prefixText = stripTagsToText(prefixChunk);
    const currentDotsLen = stripTagsToText(dotsInner).length;

    infos.push({
      dotsId,
      prefixLen: prefixText.length,
      currentDotsLen,
    });
  }

  if (infos.length === 0) return svg;

  // Colonna target: la più a destra tra tutte le righe (stato attuale)
  const targetCol = Math.max(...infos.map((i) => i.prefixLen + i.currentDotsLen));

  // Riscrivi puntini per far combaciare la colonna target
  for (const i of infos) {
    const needed = Math.max(0, targetCol - i.prefixLen);
    svg = setTspanInner(svg, i.dotsId, ".".repeat(needed));
  }

  return svg;
}

async function graphql(query, variables = {}) {
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GraphQL error ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.errors?.length) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

async function getUserBasics() {
  const user = await ghJson(`${API}/users/${USERNAME}`);
  return {
    followers: user.followers ?? 0,
    public_repos: user.public_repos ?? 0,
  };
}

async function getContributedRepoCount() {
  const q = `
    query($login:String!) {
      user(login:$login) {
        repositoriesContributedTo(
          first: 1
          includeUserRepositories: true
          contributionTypes: [COMMIT, PULL_REQUEST, ISSUE]
        ) { totalCount }
      }
    }
  `;
  const data = await graphql(q, { login: USERNAME });
  return data.user?.repositoriesContributedTo?.totalCount ?? 0;
}

async function listAllRepos() {
  let page = 1;
  const per = 100;
  const repos = [];
  for (;;) {
    const batch = await ghJson(
      `${API}/users/${USERNAME}/repos?per_page=${per}&page=${page}&sort=updated`
    );
    if (!Array.isArray(batch) || batch.length === 0) break;
    repos.push(...batch);
    if (batch.length < per) break;
    page++;
  }
  return repos;
}

async function main() {
  console.log(`Updating GitHub stats in SVG for user: ${USERNAME}`);
  console.log(`SVG_PATH: ${SVG_PATH}`);

  const svgOriginal = await fs.readFile(SVG_PATH, "utf8");

  const basics = await getUserBasics();
  const contributedCount = await getContributedRepoCount();
  const repos = await listAllRepos();

  // evita forks per stats aggregate
  const owned = repos.filter((r) => !r.fork);

  // somma stars su repo non-fork
  const stars = owned.reduce((acc, r) => acc + (r.stargazers_count ?? 0), 0);

  // commits e code frequency ultimi 52 weeks
  let commits52w = 0;
  let locAdd52w = 0;
  let locDel52w = 0;

  for (const r of owned) {
    const fullName = r.full_name;
    if (!fullName) continue;

    const commitActivity = await ghStatsJson(`${API}/repos/${fullName}/stats/commit_activity`);
    commits52w += sumCommits52w(commitActivity);

    const codeFreq = await ghStatsJson(`${API}/repos/${fullName}/stats/code_frequency`);
    const { add, del } = sumCodeFreq52w(codeFreq);
    locAdd52w += add;
    locDel52w += del;
  }

  let svg = svgOriginal;

  // aggiorna numeri
  svg = replaceTspanById(svg, "repo_data", formatInt(basics.public_repos));
  svg = replaceTspanById(svg, "contrib_data", formatInt(contributedCount));
  svg = replaceTspanById(svg, "commit_data", formatInt(commits52w));

  // "touched lines" = additions + deletions (puoi cambiarlo se vuoi)
  svg = replaceTspanById(svg, "loc_data", formatInt(locAdd52w + locDel52w));
  svg = replaceTspanById(svg, "loc_add", formatInt(locAdd52w));
  svg = replaceTspanById(svg, "loc_del", formatInt(locDel52w));

  svg = replaceTspanById(svg, "star_data", formatInt(stars));
  svg = replaceTspanById(svg, "follower_data", formatInt(basics.followers));

  // riallinea puntini (INCLUSO contributed)
  svg = adjustDotsToAlignValues(svg, [
    { dotsId: "repo_data_dots", valueId: "repo_data" },
    { dotsId: "contrib_data_dots", valueId: "contrib_data" },
    { dotsId: "commit_data_dots", valueId: "commit_data" },
    { dotsId: "loc_data_dots", valueId: "loc_data" },
    { dotsId: "star_data_dots", valueId: "star_data" },
    { dotsId: "follower_data_dots", valueId: "follower_data" },
  ]);

  if (svg !== svgOriginal) {
    await fs.writeFile(SVG_PATH, svg, "utf8");
    console.log("SVG updated.");
  } else {
    console.log("No changes detected.");
  }
}

main().catch((e) => {
  console.error(e?.stack || e);
  process.exit(1);
});
