#!/usr/bin/env node
/**
 * Generates every decorative asset the profile README uses:
 *   assets/hero.svg            animated header (CSS keyframes, self-contained)
 *   assets/badge-*.svg         portfolio / linkedin / email pills
 *   assets/stack/*.svg         tech-stack chips
 *
 * Unlike build-cards.mjs these don't depend on the GitHub API, so they only
 * need re-running when the look changes - not on every scheduled job.
 *
 *   node scripts/build-decor.mjs
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'assets');

/* ------------------------------------------------------------------ theme */
const T = {
  bg: '#1a1b26',
  border: '#2f314d',
  accent: '#7aa2f7',
  text: '#c8d3f5',
  muted: '#7a83b2',
  teal: '#2ac3de',
  purple: '#bb9af7',
  green: '#9ece6a',
  orange: '#ff9e64',
  red: '#f7768e',
};
const FONT = "'Segoe UI',Ubuntu,'Helvetica Neue',Helvetica,Arial,sans-serif";

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const textW = (s, size, weight = 400) =>
  [...String(s)].reduce((a, ch) => a + (ch === ' ' ? size * 0.3 : size * 0.57), 0) *
  (weight >= 600 ? 1.06 : 1);

const svg = (w, h, label, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" font-family="${FONT}">\n${body}\n</svg>\n`;

/* -------------------------------------------------------------- hero ---- */
/* The name is drawn statically and never animated, so the header can never come
 * up blank or half-rendered. Only the tagline underneath rotates, driven by
 * SMIL (<animate>) rather than CSS keyframes: SMIL belongs to the SVG document
 * itself, so it keeps running when the file is embedded in an <img> on another
 * page. The first tagline is also the un-animated base state, so a renderer that
 * never starts the timeline simply shows it. */
function hero() {
  // A dark panel instead of a transparent background: the README is read in both
  // GitHub themes and an <img>-referenced SVG cannot inherit the page theme.
  const W = 467;
  const H = 136;
  const X = 26;
  const NAME = "Hi, I'm Mostafa Sholkamy";
  const TAGS = [
    'Flutter & Front-End Developer',
    'Building clean & scalable apps',
  ];
  const DUR = 8;
  // Two taglines, each on for exactly half of the 8s cycle, staggered by 4s, so
  // one is always on screen and the crossfades overlap. Duty cycle and stagger
  // are derived from TAGS.length - a 3-item version left multi-second gaps where
  // nothing was drawn.
  const KT = '0;0.42;0.5;0.92;1';
  const V = '1;1;0;0;1';
  const slot = DUR / TAGS.length;

  const body = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${T.bg}" stroke="${T.border}"/>`,

    // static name + blinking terminal caret
    `<text x="${X}" y="46" font-size="26" font-weight="700" fill="${T.text}">${esc(NAME)}</text>`,
    `<g><rect x="0" y="28" width="9" height="21" rx="1.5" fill="${T.accent}"/>` +
      `<animate attributeName="opacity" values="1;0;1" dur="1.1s" repeatCount="indefinite"/></g>`,

    // rotating tagline
    ...TAGS.map((tag, i) =>
      `<g opacity="${i === 0 ? 1 : 0}">` +
      `<animate attributeName="opacity" values="${V}" keyTimes="${KT}" ` +
        `dur="${DUR}s" begin="${(i * slot).toFixed(2)}s" repeatCount="indefinite"/>` +
      `<animateTransform attributeName="transform" type="translate" ` +
        `values="0 0;0 0;0 -6;0 -6;0 0" keyTimes="${KT}" ` +
        `dur="${DUR}s" begin="${(i * slot).toFixed(2)}s" repeatCount="indefinite"/>` +
      `<text x="${X}" y="84" font-size="21" font-weight="600" fill="${[T.accent, T.teal][i]}">${esc(tag)}</text>` +
      `</g>`
    ),

    `<rect x="20" y="106" width="${W - 40}" height="1" fill="${T.border}"/>`,
    `<text x="20" y="123" font-size="12.5" fill="${T.muted}">Engineering &amp; CS Student  ·  Cairo, Egypt</text>`,
  ];
  return svg(W, H, 'Mostafa Sholkamy — Flutter & Front-End Developer', body.join('\n'));
}

/* ------------------------------------------------------------- badges ---- */
function badge(label, color, glyph) {
  const H = 30;
  const FS = 13;
  const left = glyph ? 40 : 20;
  const W = Math.round(left + textW(label, FS, 700) + 20);
  const body = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="8" fill="${color}"/>`,
    glyph
      ? `<text x="16" y="20" font-size="13" font-weight="700" fill="#ffffff">${esc(glyph)}</text>`
      : '',
    `<text x="${left}" y="20" font-size="${FS}" font-weight="700" fill="#ffffff">${esc(label)}</text>`,
  ].join('\n');
  return svg(W, H, label, body);
}

/* -------------------------------------------------------- stack chips ---- */
const STACK = {
  flutter: ['Flutter', '#02569b'],
  dart: ['Dart', '#0175c2'],
  firebase: ['Firebase', '#ffca28'],
  firestore: ['Firestore', '#f9ab00'],
  sqlite: ['SQLite', '#3b8fc4'],
  riverpod: ['Riverpod', '#7a5af8'],
  provider: ['Provider', '#00b8d4'],
  html: ['HTML5', '#e34f26'],
  css: ['CSS3', '#1572b6'],
  javascript: ['JavaScript', '#f7df1e'],
  typescript: ['TypeScript', '#3178c6'],
  cloudflare: ['Cloudflare', '#f38020'],
  git: ['Git', '#f05032'],
  github: ['GitHub', '#a371f7'],
  vscode: ['VS Code', '#007acc'],
  figma: ['Figma', '#f24e1e'],
  docker: ['Docker', '#2496ed'],
  linux: ['Linux', '#fcc624'],
};

function chip(name, color) {
  const H = 28;
  const FS = 12.5;
  const W = Math.round(12 + 10 + 9 + textW(name, FS, 600) + 12);
  const body = [
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="7" fill="${T.bg}" stroke="${T.border}"/>`,
    `<circle cx="18" cy="14" r="5" fill="${color}"/>`,
    `<circle cx="18" cy="14" r="5" fill="none" stroke="#ffffff" stroke-opacity=".18"/>`,
    `<text x="33" y="18.5" font-size="${FS}" font-weight="600" fill="${T.text}">${esc(name)}</text>`,
  ].join('\n');
  return svg(W, H, name, body);
}

/* ------------------------------------------------------------------ main */
async function main() {
  await mkdir(join(ASSETS, 'stack'), { recursive: true });
  const out = {};

  out['hero.svg'] = hero();

  out['badge-portfolio.svg'] = badge('Portfolio', '#8e6cef', '◈');
  out['badge-linkedin.svg'] = badge('LinkedIn', '#0a66c2', 'in');
  out['badge-email.svg'] = badge('Email', '#ea4335', '@');

  for (const [file, [name, color]] of Object.entries(STACK)) {
    out[join('stack', `${file}.svg`)] = chip(name, color);
  }

  for (const [rel, content] of Object.entries(out)) {
    if (!/^<svg[\s\S]*<\/svg>\n?$/.test(content.trim() + '\n')) {
      throw new Error(`${rel} is not a well-formed svg`);
    }
    await writeFile(join(ASSETS, rel), content, 'utf8');
  }
  console.log(`[decor] wrote ${Object.keys(out).length} assets`);
}

main().catch((e) => {
  console.error('[decor] FAILED:', e.message);
  process.exit(1);
});
