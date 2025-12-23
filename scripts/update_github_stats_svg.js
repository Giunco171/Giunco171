// scripts/update_github_stats_svg.js
// CommonJS - Node 20+ (fetch globale)

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

// === CONFIG: line width ===
const LINE_WIDTH = 99; // ogni riga GitHub Stats deve avere esattamente 99 caratteri

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

function setDots(svg, dotsId, dotsCount) {
  const n = Math.max(0, Math.trunc(dotsCount));
  return replaceTspanById(svg, dotsId, ".".repeat(n));
}

/**
 * Applica la logica richiesta:
 * - ogni riga deve avere LINE_WIDTH caratteri
 * - dots = LINE_WIDTH - prefixLen - statsLen
 * dove prefix e stats includono spazi (esattamente come appaiono nel SVG).
 */
function applyDotsRule(svg, rules) {
  for (const r of rules) {
    const prefixLen = r.prefix.length;
    const statsLen = r.stats.length;
    const dots = LINE_WIDTH - prefixLen - statsLen;

    // Se stats troppo lunghe, dots diventa negativo => clamp a 0
    svg = setDots(svg, r.dotsId, dots);
  }
  return svg;
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

  // stars: somma stargazers_count dei repo non-fork
  const stars = owned.reduce((acc, r) => acc + (r.stargazers_count ?? 0), 0);

  // commits e LOC (ultimi 52 weeks) via endpoints stats
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

  // Valori formattati (ATTENZIONE: questi determinano statsLen!)
  const repoStr = formatInt(basics.public_repos);
  const contribStr = formatInt(contributedCount);
  const commitsStr = formatInt(commits52w);

  const locAddStr = formatInt(locAdd52w);
  const locDelStr = formatInt(locDel52w);
  const locTotalStr = formatInt(locAdd52w + locDel52w); // "touched lines" (come prima)

  const starsStr = formatInt(stars);
  const followersStr = formatInt(basics.followers);

  let svg = svgOriginal;

  // === 1) aggiorna i numeri negli id ===
  svg = replaceTspanById(svg, "repo_data", repoStr);
  svg = replaceTspanById(svg, "contrib_data", contribStr);
  svg = replaceTspanById(svg, "commit_data", commitsStr);

  svg = replaceTspanById(svg, "loc_data", locTotalStr);
  svg = replaceTspanById(svg, "loc_add", locAddStr);
  svg = replaceTspanById(svg, "loc_del", locDelStr);

  svg = replaceTspanById(svg, "star_data", starsStr);
  svg = replaceTspanById(svg, "follower_data", followersStr);

  // === 2) applica la logica dei 99 caratteri ===
  // Prefissi: devono rappresentare ESATTAMENTE i caratteri visibili prima dei puntini.
  // Stats: devono rappresentare ESATTAMENTE i caratteri visibili dopo i puntini.
  //
  // NOTA: in about.svg sotto, la parte "prefix" è costruita come:
  // ". " + LABEL + ":"   (dove lo spazio dopo il punto è presente)
  //
  // Repos stats (tutto dopo i puntini):
  // " " + repo + " {Contributed: " + contrib + "}"
  //
  // Commits stats:
  // " " + commits
  //
  // LOC stats:
  // " " + locTotal + " ( " + locAdd + "++, " + locDel + "-- )"
  //
  // Stars / Followers:
  // " " + value
  const rules = [
    {
      dotsId: "repo_data_dots",
      prefix: ". Repos:",
      stats: ` ${repoStr} {Contributed: ${contribStr}}`,
    },
    {
      dotsId: "commit_data_dots",
      prefix: ". Commits:",
      stats: ` ${commitsStr}`,
    },
    {
      dotsId: "loc_data_dots",
      prefix: ". Lines of Code on GitHub:",
      stats: ` ${locTotalStr} ( ${locAddStr}++, ${locDelStr}-- )`,
    },
    {
      dotsId: "star_data_dots",
      prefix: ". Stars:",
      stats: ` ${starsStr}`,
    },
    {
      dotsId: "follower_data_dots",
      prefix: ". Followers:",
      stats: ` ${followersStr}`,
    },
  ];

  svg = applyDotsRule(svg, rules);

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
