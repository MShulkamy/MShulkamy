#!/usr/bin/env node
/**
 * Generates the GitHub Analytics cards as STATIC .svg files inside this repo.
 *
 * Why static files instead of remote image URLs:
 *   The old cards used github-profile-summary-cards.vercel.app, a single shared
 *   Vercel instance whose original upstream repo was deleted. It rate-limits
 *   constantly and prints "Cards are temporarily rate limited." forever.
 *   A .svg committed to the repo is served from GitHub's CDN -> no third party,
 *   no rate limit, nothing to re-edit later.
 *
 * Usage:
 *   GITHUB_TOKEN=<pat> node scripts/build-cards.mjs [username]
 *
 * The script never overwrites anything on failure: it writes the SVGs only
 * after every API call has succeeded, so a broken run leaves the previous
 * (still valid) cards in place.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'assets');

const USERNAME = process.argv[2] || process.env.GITHUB_USERNAME || 'MShulkamy';
const TOKEN =
  process.env.CARDS_TOKEN ||
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN;

if (!TOKEN) {
  console.error('Missing token. Set GITHUB_TOKEN (or CARDS_TOKEN) before running.');
  process.exit(1);
}

const API = 'https://api.github.com';

/* ------------------------------------------------------------------ theme */
const T = {
  bg: '#1a1b26',
  border: '#2f314d',
  title: '#7aa2f7',
  text: '#c8d3f5',
  muted: '#7a83b2',
  icon: '#9aa5ce',
  green: '#9ece6a',
  yellow: '#e0af68',
  orange: '#ff9e64',
  red: '#f7768e',
  purple: '#bb9af7',
  cyan: '#7dcfff',
  teal: '#2ac3de',
  blue: '#7aa2f7',
};
const FONT = "'Segoe UI',Ubuntu,'Helvetica Neue',Helvetica,Arial,sans-serif";

/* ---------------------------------------------------------------- helpers */
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** 1234 -> "1.2k" */
function fmt(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k';
  return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
}

/** rough width of a text run, good enough for layout */
const textW = (s, size, weight = 400) =>
  [...String(s)].reduce((a, ch) => a + (ch === ' ' ? size * 0.3 : size * 0.57), 0) *
  (weight >= 600 ? 1.06 : 1);

const ymd = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
};

/* ------------------------------------------------------------------ icons */
/* Octicons 16px, MIT. Inlined so the SVG stays fully self-contained. */
const ICON = {
  commit:
    'M11.93 8.5a4.002 4.002 0 0 0-7.86 0H.25a.75.75 0 0 0 0 1.5h3.82a4.002 4.002 0 0 0 7.86 0h3.82a.75.75 0 0 0 0-1.5Zm-1.43-.5a2.5 2.5 0 1 0-3.86 0H10.5ZM4.25 13.5a.75.75 0 0 0 0 1.5h7.5a.75.75 0 0 0 0-1.5Z',
  pr:
    'M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 0 10 .854V2.5h1A2.5 2.5 0 0 1 12.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 2 0 0 0-1-1h-1v1.646a.25.25 0 0 0-.427.177L7.177 3.427a.25.25 0 0 0 0 .354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z',
  issue:
    'M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z',
  star:
    'M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l3.046-2.97.719-4.192A.751.751 0 0 1 8 .25Z',
  repo:
    'M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z',
  people:
    'M5.5 3.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0Zm5.05.75A2.5 2.5 0 0 1 14 6.5v.5h1.5a.75.75 0 0 1 0 1.5H14v2.75a.75.75 0 0 1-1.5 0V8.5h-.75a.75.75 0 0 1 0-1.5H12.5v-.5a3.5 3.5 0 0 0-1.95-3.162ZM5.5 5.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1ZM3 8.75A2.75 2.75 0 0 1 5.75 6h1.5a2.75 2.75 0 0 1 2.75 2.75v3.25a.75.75 0 0 1-1.5 0V11h-.75v2.25a.75.75 0 0 1-1.5 0V11h-.75v1.25a.75.75 0 0 1-1.5 0V8.75Z',
  clock:
    'M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z',
  calendar:
    'M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16h-10.5A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75a.75.75 0 0 1 .75-.75ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-3.5H2.75a.25.25 0 0 0-.25.25V6h11V4.25a.25.25 0 0 0-.25-.25Z',
  code:
    'M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.97 9.53a.75.75 0 0 1 0-1.06Zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.75-4.25a.75.75 0 0 0 0-1.06Z',
  flame:
    'M8 .8c.3 0 .6.2.7.5.9 2 2.9 3.1 2.9 5.6 0 1.9-1.6 3.4-3.6 3.4S4.4 8.8 4.4 6.9c0-1.1.4-2 1-2.8.1.8.5 1.4 1.1 1.8.7.4 1.6.2 2-.5.4-.6.5-1.4.2-2.2-.2-.7-.5-1.5-.7-2.4Z',
};

const icon = (name, x, y, size = 16, color = T.icon) =>
  `<path d="${ICON[name]}" transform="translate(${x} ${y}) scale(${size / 16})" fill="${color}"/>`;

/* ------------------------------------------------------------ svg shells */
function frame(w, h, title, subtitle) {
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}" font-family="${FONT}">`,
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="8" fill="${T.bg}" stroke="${T.border}"/>`,
    `<text x="${w / 2}" y="34" text-anchor="middle" font-size="19" font-weight="700" fill="${T.title}">${esc(title)}</text>`,
  ];
  if (subtitle) {
    parts.push(
      `<text x="${w / 2}" y="53" text-anchor="middle" font-size="11" fill="${T.muted}">${esc(subtitle)}</text>`
    );
  }
  return parts;
}

/** icon + value + label, laid out left to right from x */
function stat(x, y, iconName, value, label, color = T.icon) {
  return [
    icon(iconName, x, y - 13, 16, color),
    `<text x="${x + 24}" y="${y}" font-size="16" font-weight="700" fill="${T.text}">${esc(fmt(value))}</text>`,
    `<text x="${x + 24 + textW(fmt(value), 16, 700) + 7}" y="${y}" font-size="11.5" fill="${T.muted}">${esc(label)}</text>`,
  ].join('');
}

/* -------------------------------------------------------------- fetching */
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'profile-cards-builder',
};

async function api(path) {
  const res = await fetch(API + path, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET ${path} -> ${res.status} ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function graphql(query, variables) {
  const res = await fetch(API + '/graphql', {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`graphql -> ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error('graphql: ' + JSON.stringify(json.errors).slice(0, 400));
  return json.data;
}

const CONTRIB_QUERY = `
query($login:String!,$from:DateTime!,$to:DateTime!){
  user(login:$login){
    contributionsCollection(from:$from,to:$to){
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      totalRepositoriesWithContributedCommits
      contributionCalendar{
        totalContributions
        weeks{ contributionDays{ date contributionCount contributionLevel } }
      }
    }
  }
}`;

async function fetchContributions(login, createdAt) {
  const created = new Date(createdAt);
  const today = new Date();

  // first window = the trailing 365 days (its aggregate counters feed the stats card)
  const windows = [];
  const lastYearFrom = addDays(today, -364);
  windows.push({ from: lastYearFrom, to: today, isLastYear: true });

  let cursor = lastYearFrom;
  while (cursor.getTime() > created.getTime()) {
    const to = addDays(cursor, -1);
    let from = addDays(to, -364);
    if (from.getTime() < created.getTime()) from = created;
    windows.push({ from, to });
    cursor = from;
    if (windows.length > 30) throw new Error('too many windows');
  }

  const days = new Map();
  let lastYear = null;

  for (const w of windows) {
    const data = await graphql(CONTRIB_QUERY, {
      login,
      from: w.from.toISOString(),
      to: w.to.toISOString(),
    });
    const c = data.user.contributionsCollection;
    if (w.isLastYear) {
      lastYear = {
        commits: c.totalCommitContributions,
        issues: c.totalIssueContributions,
        prs: c.totalPullRequestContributions,
        reviews: c.totalPullRequestReviewContributions,
        reposWithCommits: c.totalRepositoriesWithContributedCommits,
      };
    }
    for (const week of c.contributionCalendar.weeks) {
      for (const d of week.contributionDays) {
        days.set(d.date, d);
      }
    }
  }

  if (!lastYear) throw new Error('no last-year window produced data');

  // ordered day list
  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));

  // totals over the whole recorded history
  const totalContributions = list.reduce((s, d) => s + d.contributionCount, 0);

  // every contribution that actually happened inside the trailing-year window.
  // (commits + prs + issues + reviews misses repo-creation / review-only days,
  //  so we sum the calendar itself rather than adding the aggregate counters.)
  lastYear.contributions = list
    .filter((d) => d.date >= ymd(windows[0].from))
    .reduce((s, d) => s + d.contributionCount, 0);

  // longest streak
  let longest = { count: 0, end: null, start: null };
  let run = 0;
  let runStart = null;
  for (const d of list) {
    if (d.contributionCount > 0) {
      if (run === 0) runStart = d.date;
      run++;
      if (run > longest.count) longest = { count: run, end: d.date, start: runStart };
    } else {
      run = 0;
      runStart = null;
    }
  }

  // current streak: walk back from today; today not counted yet is fine
  const byDate = new Map(list.map((d) => [d.date, d]));
  let current = 0;
  let cursorDay = new Date(today);
  // if today has no contribution yet, start counting from yesterday
  if (!byDate.get(ymd(cursorDay))?.contributionCount) cursorDay = addDays(cursorDay, -1);
  while (byDate.get(ymd(cursorDay))?.contributionCount > 0) {
    current++;
    cursorDay = addDays(cursorDay, -1);
  }

  return { days: list, byDate, lastYear, totalContributions, longest, current };
}

/* ----------------------------------------------------------------- cards */
function cardStats(s) {
  const W = 467;
  const H = 200;
  const rows = [
    [s.lastYear.contributions, 'Contributions · last year', 'flame', T.orange],
    [s.lastYear.commits, 'Commits · last year', 'commit', T.green],
    [s.lastYear.prs, 'Pull Requests', 'pr', T.purple],
    [s.lastYear.issues, 'Issues', 'issue', T.yellow],
    [s.stars, 'Stars Earned', 'star', T.yellow],
    [s.publicRepos, 'Public Repos', 'repo', T.cyan],
  ];
  const out = frame(W, H, `${s.login}'s GitHub Stats`, 'rolling 12 months · refreshed automatically');
  rows.forEach((r, i) => {
    const col = i % 2;
    const line = Math.floor(i / 2);
    out.push(stat(40 + col * 215, 92 + line * 36, r[2], r[0], r[1], r[3]));
  });
  out.push('</svg>');
  return out.join('\n');
}

function cardStreak(s) {
  const W = 495;
  const H = 175;
  const cell = (cx, value, label, iconName, color) =>
    [
      icon(iconName, cx - 8, 76, 16, color),
      `<text x="${cx}" y="128" text-anchor="middle" font-size="30" font-weight="700" fill="${T.title}">${esc(fmt(value))}</text>`,
      `<text x="${cx}" y="147" text-anchor="middle" font-size="12" fill="${T.muted}">${esc(label)}</text>`,
    ].join('');

  const out = frame(W, H, 'Contribution Streak');
  out.push('<line x1="165" y1="70" x2="165" y2="152" stroke="' + T.border + '" stroke-width="1"/>');
  out.push('<line x1="330" y1="70" x2="330" y2="152" stroke="' + T.border + '" stroke-width="1"/>');
  out.push(cell(82, s.totalContributions, 'Total Contributions', 'commit', T.green));
  out.push(cell(248, s.current, 'Current Streak', 'clock', T.orange));
  out.push(cell(413, s.longest.count, 'Longest Streak', 'calendar', T.purple));
  out.push('</svg>');
  return out.join('\n');
}

const LANG_COLORS = {
  dart: '#0175C2', javascript: '#f1e05a', typescript: '#3178c6', html: '#e34c26',
  css: '#563d7c', python: '#3572A5', java: '#b07219', kotlin: '#A97BFF',
  swift: '#F05138', 'c++': '#f34b7d', c: '#555555', 'c#': '#178600', go: '#00ADD8',
  rust: '#dea584', php: '#4F5D95', ruby: '#701516', shell: '#89e051', vue: '#41b883',
  sql: '#e38c00', cmake: '#DA3434', dart_: '#0175C2', plaintext: '#cccccc', other: '#8b949e',
};
const langColor = (name) => LANG_COLORS[String(name).toLowerCase()] || '#8b949e';

function cardLanguages(langs) {
  const shown = langs.slice(0, 8);
  const W = 467;
  const H = 96 + shown.length * 24;
  const total = shown.reduce((s, l) => s + l.bytes, 0) || 1;

  const out = frame(W, H, 'Top Languages', `${shown.length} languages · by bytes of code`);
  out.push(`<rect x="40" y="66" width="387" height="8" rx="4" fill="${T.border}"/>`);
  let x = 40;
  for (const l of shown) {
    const w = Math.max(2, (l.bytes / total) * 387);
    out.push(`<rect x="${x.toFixed(1)}" y="66" width="${w.toFixed(1)}" height="8" fill="${langColor(l.name)}"/>`);
    x += w;
  }
  shown.forEach((l, i) => {
    const y = 100 + i * 24;
    const pct = ((l.bytes / total) * 100).toFixed(1);
    out.push(`<circle cx="48" cy="${y - 4}" r="5" fill="${langColor(l.name)}"/>`);
    out.push(`<text x="62" y="${y}" font-size="13" font-weight="600" fill="${T.text}">${esc(l.name)}</text>`);
    out.push(`<text x="427" y="${y}" text-anchor="end" font-size="12" fill="${T.muted}">${esc(pct)}%</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}

function cardProfile(s) {
  const W = 467;
  const H = 200;
  const memberSince = new Date(s.createdAt).toLocaleDateString('en-GB', {
    month: 'short', year: 'numeric', timeZone: 'UTC',
  });
  const out = frame(W, H, `${s.name} · Profile`, `@${s.login}`);
  const rows = [
    [s.publicRepos, 'Public Repos', 'repo', T.cyan],
    [s.stars, 'Stars Earned', 'star', T.yellow],
    [s.followers, 'Followers', 'people', T.green],
    [s.following, 'Following', 'people', T.purple],
    [memberSince, 'Member Since', 'calendar', T.blue],
    [s.longest.count + 'd', 'Longest Streak', 'clock', T.orange],
  ];
  rows.forEach((r, i) => {
    const col = i % 2;
    const line = Math.floor(i / 2);
    // memberSince is a string -> skip fmt()
    const x = 40 + col * 215;
    const y = 92 + line * 36;
    const val = String(r[0]);
    out.push(icon(r[2], x, y - 13, 16, r[3]));
    out.push(`<text x="${x + 24}" y="${y}" font-size="16" font-weight="700" fill="${T.text}">${esc(val)}</text>`);
    out.push(`<text x="${x + 24 + textW(val, 16, 700) + 7}" y="${y}" font-size="11.5" fill="${T.muted}">${esc(r[1])}</text>`);
  });
  out.push('</svg>');
  return out.join('\n');
}

function cardGraph(days) {
  // 53 full weeks (Sun..Sat), the last one ending on the most recent Sunday
  const CELL = 11;
  const GAP = 2.5;
  const STEP = CELL + GAP;
  const WEEKS = 53;
  const W = 20 + WEEKS * STEP + 34;
  const H = 44 + 7 * STEP + 30;
  const today = new Date();
  const endSunday = addDays(today, -today.getUTCDay()); // dow 0=Sun
  const start = addDays(endSunday, -(WEEKS * 7 - 1));
  const byDate = new Map(days.map((d) => [d.date, d]));

  const LEVEL_FILL = ['#22243a', '#0e4429', '#006d32', '#26a641', '#39d353'];
  const LEVEL_BY_NAME = {
    NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4,
  };

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Contribution graph" font-family="${FONT}">`,
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${T.bg}" stroke="${T.border}"/>`,
    `<text x="20" y="28" font-size="15" font-weight="700" fill="${T.title}">Contribution Graph</text>`,
  ];
  // sum only the days the grid actually displays
  const windowTotal = days
    .filter((d) => d.date >= ymd(start) && d.date <= ymd(today))
    .reduce((s, d) => s + d.contributionCount, 0);
  out.push(
    `<text x="${W - 16}" y="28" text-anchor="end" font-size="11" fill="${T.muted}">${esc(fmt(windowTotal))} in the last year</text>`
  );

  // month labels sit in the 12px strip above the grid (min 3 weeks apart so
  // short first/last months don't collide with their neighbour)
  let lastLabeledWeek = -99;
  let lastMonth = -1;
  const monthLabels = [];
  for (let w = 0; w < WEEKS; w++) {
    const weekStart = addDays(start, w * 7);
    if (weekStart.getUTCMonth() === lastMonth) continue;
    lastMonth = weekStart.getUTCMonth();
    if (w - lastLabeledWeek < 3) continue;
    lastLabeledWeek = w;
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    const x = 20 + w * STEP;
    if (x + textW(label, 9) < W - 16) {
      monthLabels.push(`<text x="${x.toFixed(1)}" y="40" font-size="9" fill="${T.muted}">${esc(label)}</text>`);
    }
  }
  out.push(monthLabels.join(''));

  // the grid itself
  const cells = [];
  for (let w = 0; w < WEEKS; w++) {
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(start, w * 7 + dow);
      if (date > today) continue;
      const d = byDate.get(ymd(date));
      const lvl = d ? LEVEL_BY_NAME[d.contributionLevel] ?? 0 : 0;
      const x = 20 + w * STEP;
      const y = 44 + dow * STEP;
      cells.push(
        `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${CELL}" height="${CELL}" rx="2.5" fill="${LEVEL_FILL[lvl]}"><title>${ymd(date)} · ${d?.contributionCount ?? 0}</title></rect>`
      );
    }
  }
  out.push(`<g>${cells.join('')}</g>`);

  // weekday labels, centred on rows 1 / 3 / 5 (Mon / Wed / Fri)
  out.push(
    [['Mon', 1], ['Wed', 3], ['Fri', 5]]
      .map(([name, dow]) => {
        const y = 44 + dow * STEP + CELL - 1.5;
        return `<text x="${W - 14}" y="${y.toFixed(1)}" text-anchor="end" font-size="9" fill="${T.muted}">${name}</text>`;
      })
      .join('')
  );

  // legend: "Less" [swatches] "More"
  const ly = H - 18;
  const swatchX = 20 + 28;
  out.push(`<text x="20" y="${ly + 8}" font-size="9" fill="${T.muted}">Less</text>`);
  out.push(
    LEVEL_FILL.map((c, i) =>
      `<rect x="${(swatchX + i * STEP).toFixed(1)}" y="${ly}" width="${CELL}" height="${CELL}" rx="2.5" fill="${c}"/>`
    ).join('')
  );
  out.push(`<text x="${(swatchX + 5 * STEP + 6).toFixed(1)}" y="${ly + 8}" font-size="9" fill="${T.muted}">More</text>`);

  out.push('</svg>');
  return out.join('\n');
}

/* ------------------------------------------------------------------ main */
async function main() {
  console.log(`[cards] building for ${USERNAME} ...`);

  const user = await api(`/users/${USERNAME}`);
  const repos = await api(`/users/${USERNAME}/repos?per_page=100&sort=pushed`);

  // language byte totals (skip forks and the profile repo itself)
  const langMap = new Map();
  const counted = repos.filter((r) => !r.fork && r.name.toLowerCase() !== USERNAME.toLowerCase());
  for (const r of counted) {
    let langs;
    try {
      langs = await api(`/repos/${r.full_name}/languages`);
    } catch {
      continue; // empty repo
    }
    for (const [name, bytes] of Object.entries(langs)) {
      langMap.set(name, (langMap.get(name) || 0) + bytes);
    }
  }
  const langs = [...langMap.entries()]
    .map(([name, bytes]) => ({ name, bytes }))
    .sort((a, b) => b.bytes - a.bytes);

  const stars = repos.reduce((s, r) => s + r.stargazers_count, 0);

  const { days, lastYear, totalContributions, longest, current } =
    await fetchContributions(USERNAME, user.created_at);

  const state = {
    login: user.login,
    name: user.name || user.login,
    createdAt: user.created_at,
    followers: user.followers,
    following: user.following,
    publicRepos: repos.filter((r) => !r.fork).length,
    stars,
    lastYear,
    totalContributions,
    longest,
    current,
  };

  console.log(
    `[cards] commits(1y)=${lastYear.commits} prs=${lastYear.prs} issues=${lastYear.issues} ` +
      `total=${totalContributions} currentStreak=${current} longest=${longest.count} stars=${stars}`
  );

  const files = {
    'stats.svg': cardStats(state),
    'streak.svg': cardStreak(state),
    'languages.svg': cardLanguages(langs),
    'profile.svg': cardProfile(state),
    'contribution-graph.svg': cardGraph(days),
  };

  await mkdir(OUT_DIR, { recursive: true });
  for (const [name, svg] of Object.entries(files)) {
    if (!/^<svg[\s\S]*<\/svg>$/.test(svg.trim())) throw new Error(`${name} is not valid SVG`);
    await writeFile(join(OUT_DIR, name), svg + '\n', 'utf8');
    console.log(`[cards] wrote assets/${name} (${svg.length} bytes)`);
  }
  console.log('[cards] done.');
}

main().catch((e) => {
  console.error('[cards] FAILED:', e.message);
  process.exit(1);
});
