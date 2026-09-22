/**
 * Guard against the npm bug that keeps breaking CI (npm/cli#4828).
 *
 * Packages with native binaries — rolldown (under Vitest), and anything else
 * that ships one `.node` per platform — declare one optional dependency per
 * platform. When `npm install` runs on Windows, npm records **only** the
 * binding it actually installed and drops the other fourteen from
 * `package-lock.json`. Nothing looks wrong locally. Then `npm ci` on Linux —
 * GitHub Actions, Vercel — builds its ideal tree, finds those entries absent
 * and refuses to install anything at all:
 *
 *     npm error `npm ci` can only install packages when your package.json and
 *     package-lock.json ... are in sync.
 *     npm error Missing: @rolldown/binding-linux-x64-gnu@1.2.9 from lock file
 *
 * It costs a push, a CI run and a failed deployment to find that out. This
 * says the same thing in one second, before anything is installed: for every
 * package in the lock, every optional dependency it declares must have an
 * entry the lock can resolve, the way npm looks it up — beside the package,
 * then up towards the root.
 *
 * If it fails, the fix is not to delete the lockfile and reinstall (that is
 * what causes it). Take the missing entries from a lockfile resolved with no
 * `node_modules` present — `npm install --package-lock-only` in an empty
 * directory holding only `package.json` — and put them back.
 *
 * Runs on plain Node with no dependencies, so CI can call it before `npm ci`.
 */
import { readFileSync } from "node:fs";

const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const packages = lock.packages ?? {};

/** Where npm would find `name` for the package at `from`: beside it, then upwards. */
function resolves(from, name) {
  let dir = from;
  for (;;) {
    if (packages[`${dir ? `${dir}/` : ""}node_modules/${name}`]) return true;
    if (!dir) return false;
    dir = dir.includes("/node_modules/") ? dir.slice(0, dir.lastIndexOf("/node_modules/")) : "";
  }
}

const gaps = [];
for (const [key, entry] of Object.entries(packages)) {
  for (const name of Object.keys(entry.optionalDependencies ?? {})) {
    if (!resolves(key, name)) gaps.push(`${key || "<root>"} declares ${name}`);
  }
}

if (gaps.length > 0) {
  console.error(
    `package-lock.json is missing ${gaps.length} optional dependency ` +
      `${gaps.length === 1 ? "entry" : "entries"}. \`npm ci\` will fail on Linux ` +
      `(and on Vercel) even though it works here:\n`
  );
  for (const gap of gaps) console.error(`  ${gap}`);
  console.error("\nSee the comment at the top of scripts/check-lockfile.mjs for the fix.");
  process.exit(1);
}

console.log(`package-lock.json: ${Object.keys(packages).length} packages, no missing optional entries.`);
