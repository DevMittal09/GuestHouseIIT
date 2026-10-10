/**
 * Is `.memories/` still the fifteen files it is supposed to be, and does every
 * link in them point at something?
 *
 * This exists because the folder drifted. It had grown to twenty-five files
 * with overlapping jobs, so a round of changes would be written up in one of
 * the three files that covered the subject and the other two would quietly go
 * stale - and `README.md` spent weeks linking to a file that had been deleted,
 * which nothing noticed because nothing checked. Both failures are cheap to
 * end: assert the file list, and resolve every link.
 *
 *     node scripts/check-memories.mjs
 *     npm run check:memories
 *
 * **Read-only.** It reads the markdown in `.memories/` and nothing else, makes
 * no network calls, and writes nothing. Exits 1 on the first kind of problem
 * it finds, after listing all of them.
 *
 * When you add or rename a file in `.memories/`, add it to EXPECTED below -
 * that is the point of the list. Fifteen is not sacred, but a sixteenth file
 * should be a decision, not an accident.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const DIR = ".memories";

/** The files this folder is supposed to have, and the one job each one owns. */
const EXPECTED = {
  "README.md": "the index, the file map, the glossary, the maintenance contract",
  "01-background.md": "the problem, the people, every requirement list and its status",
  "02-decisions.md": "why anything is the way it is, append-only",
  "03-roadmap.md": "what is open",
  "04-production.md": "what production needs, how to deploy and operate it",
  "05-credentials-and-security.md": "every login, every secret by name, what protects the portal",
  "10-roles-and-workflows.md": "roles, approval pipelines, states, every automatic mail",
  "11-booking-forms.md": "every form, every submission rule, the academic record behind it",
  "12-settings-and-defaults.md": "every configurable value and its default",
  "13-billing-and-dining.md": "tariffs, invoices, payments, dining",
  "14-public-site-and-ui.md": "the public site and the design system",
  "20-architecture.md": "how it is built, and where each feature's code lives",
  "21-database.md": "tables, enums, RLS, every migration",
  "22-running-and-testing.md": "running it, verifying a change, every trap already hit",
  "99-recent-changes.md": "the last round only",
};

/** GitHub's heading slug: lowercase, strip punctuation, spaces to hyphens. */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`|\*/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N} \-_]/gu, "")
    .replace(/ /g, "-");
}

/** Headings outside fenced code blocks, as anchors. */
function anchorsOf(text) {
  const anchors = new Set();
  let fenced = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    const heading = /^#{1,6} +(.*)$/.exec(line);
    if (heading) anchors.add(slug(heading[1]));
  }
  return anchors;
}

const problems = [];

// 1. The file list.
const present = readdirSync(DIR).filter((name) => !name.startsWith("."));
for (const name of Object.keys(EXPECTED)) {
  if (!present.includes(name)) problems.push(`missing: ${DIR}/${name} - ${EXPECTED[name]}`);
}
for (const name of present) {
  if (!(name in EXPECTED)) {
    problems.push(
      `stray: ${DIR}/${name} - not in EXPECTED. Fold it into a file that owns ` +
        `the subject, or add it to scripts/check-memories.mjs on purpose.`,
    );
  }
}

// 2. Every relative link resolves, and every anchor exists.
const anchors = new Map();
for (const name of present.filter((n) => n.endsWith(".md"))) {
  anchors.set(join(DIR, name), anchorsOf(readFileSync(join(DIR, name), "utf8")));
}

const LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
for (const name of present.filter((n) => n.endsWith(".md"))) {
  const path = join(DIR, name);
  const text = readFileSync(path, "utf8");
  for (const [, target] of text.matchAll(LINK)) {
    if (/^(https?:|mailto:|#)/.test(target)) {
      if (target.startsWith("#")) {
        const anchor = decodeURIComponent(target.slice(1));
        if (anchor && !anchors.get(path).has(anchor)) {
          problems.push(`${path}: no heading for its own anchor "#${anchor}"`);
        }
      }
      continue;
    }
    const [file, anchor] = decodeURIComponent(target).split("#");
    const resolved = file ? resolve(dirname(path), file) : path;
    if (!existsSync(resolved)) {
      problems.push(`${path}: link to "${target}" - no such file`);
      continue;
    }
    const known = anchors.get(relative(process.cwd(), resolved));
    if (anchor && known && !known.has(anchor)) {
      problems.push(`${path}: link to "${target}" - the file has no such heading`);
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s) in ${DIR}/:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("");
  process.exit(1);
}

console.log(`${DIR}/: ${present.length} files, all expected, every link resolves.`);
