import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The row-level-security surface, asserted against the SQL itself.
 *
 * **Why this test exists.** On 13 Oct 2026, reviewing the schema before the
 * institute's user import, two things this project had written down turned out
 * to be false:
 *
 * - `.memories/04-production.md` said the Supabase Auth password `password123`
 *   was "harmless, because the Auth password is not a portal login".
 * - `.memories/05-credentials-and-security.md` said RLS had "no
 *   `authenticated` write policy - which is what makes the public anon key
 *   safe to ship".
 *
 * There were **38** `authenticated` policies, 21 of them writes, including
 * `developer manages profiles` - and the anon key ships in the browser by
 * design, so a GoTrue password grant on any seeded address was a way in that
 * the portal's LDAP door did not guard. Migration 31 closed it.
 *
 * Both claims were plausible, written in good faith, and read twice without
 * anyone checking them against the SQL. Prose cannot be trusted to stay true,
 * so the invariant is asserted here instead: **nothing in `public` or
 * `storage` grants anything to `authenticated`.** The portal reads and writes
 * with the service-role key; sign-in is LDAP plus the `sessions` table
 * (migration 21); and the one client-side Supabase user,
 * `components/live-updates.tsx`, connects with `persistSession: false` - as
 * `anon`, for which no policy has ever existed.
 *
 * If you are here because this test failed, that is the test working. Adding
 * an `authenticated` policy means deciding that a browser may hold a database
 * credential, which needs a per-user identity mapping that does not currently
 * exist (`auth.uid()` stopped corresponding to `profiles.id` at migration 31).
 * Decide that deliberately, write it in `.memories/02-decisions.md`, and then
 * add the policy to ALLOWED_AUTHENTICATED below with the reason.
 */

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS, name), "utf8") }));
}

/** Strip `--` line comments so prose about a policy is not read as one. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => {
      const at = line.indexOf("--");
      return at === -1 ? line : line.slice(0, at);
    })
    .join("\n");
}

type Policy = { name: string; table: string; op: string; role: string; file: string };

function policies(): { created: Policy[]; dropped: Set<string> } {
  const created: Policy[] = [];
  const dropped = new Set<string>();
  for (const { name: file, sql } of migrationFiles()) {
    const bare = withoutComments(sql);
    const create =
      /create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)\s+for\s+(\w+)\s+to\s+(\w+)/gi;
    for (let m = create.exec(bare); m; m = create.exec(bare)) {
      created.push({ name: m[1], table: m[2], op: m[3], role: m[4], file });
    }
    const drop = /drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+([\w.]+)/gi;
    for (let m = drop.exec(bare); m; m = drop.exec(bare)) {
      dropped.add(`${m[2]}::${m[1]}`);
    }
  }
  return { created, dropped };
}

/**
 * Policies granted to `authenticated` that are allowed to survive.
 *
 * Empty, deliberately. See the note at the top of this file before adding to
 * it.
 */
const ALLOWED_AUTHENTICATED: string[] = [];

describe("the authenticated RLS surface", () => {
  it("grants nothing to `authenticated` once every migration has run", () => {
    const { created, dropped } = policies();
    const surviving = created
      .filter((p) => p.role === "authenticated")
      .filter((p) => !dropped.has(`${p.table}::${p.name}`))
      .filter((p) => !ALLOWED_AUTHENTICATED.includes(`${p.table}::${p.name}`));

    expect(
      surviving.map((p) => `${p.table} [${p.op}] "${p.name}" (${p.file})`),
      "an `authenticated` policy survives every migration - see the note at the top of tests/rls-surface.test.ts"
    ).toEqual([]);
  });

  it("still has the 38 authenticated policies on record, each one dropped", () => {
    // Guards the test itself: if the parser stopped matching, the assertion
    // above would pass vacuously. The historical count is fixed, so a change
    // here is a real change to the migrations.
    const { created, dropped } = policies();
    const auth = created.filter((p) => p.role === "authenticated");
    expect(auth.length).toBe(38);
    for (const p of auth) {
      expect(dropped.has(`${p.table}::${p.name}`), `${p.table} "${p.name}" is never dropped`).toBe(
        true
      );
    }
  });

  it("keeps row-level security enabled on every table it was enabled on", () => {
    // Dropping the policies must not be confused with turning RLS off. With
    // RLS on and no policy, `authenticated` is denied by default and
    // service-role still bypasses - the pattern migration 28 chose for
    // `academic_records`. With RLS off, every role reads everything.
    const all = migrationFiles()
      .map((f) => withoutComments(f.sql))
      .join("\n");
    expect(all).not.toMatch(/alter\s+table\s+[\w.]+\s+disable\s+row\s+level\s+security/i);
  });

  it("leaves the private documents bucket with no browser-reachable policy", () => {
    const { created, dropped } = policies();
    const storage = created
      .filter((p) => p.table === "storage.objects" && p.role === "authenticated")
      .filter((p) => !dropped.has(`${p.table}::${p.name}`));
    expect(storage).toEqual([]);

    const all = migrationFiles()
      .map((f) => withoutComments(f.sql))
      .join("\n");
    // The bucket is created private and must stay private: signed URLs are
    // issued server-side (`createSignedUrl`).
    expect(all).not.toMatch(/storage\.buckets[\s\S]{0,200}'documents'[\s\S]{0,60}\btrue\b/i);
  });
});

describe("profiles is independent of Supabase Auth", () => {
  it("no longer references auth.users", () => {
    const { sql: initial } = migrationFiles().find((f) => f.name.includes("initial_schema"))!;
    // The constraint was there to begin with...
    expect(initial).toMatch(/id\s+uuid\s+primary\s+key\s+references\s+auth\.users/i);

    // ...and is dropped by name, not discovered, so nothing else can go with it.
    const all = migrationFiles()
      .map((f) => withoutComments(f.sql))
      .join("\n");
    expect(all).toMatch(/drop\s+constraint\s+if\s+exists\s+profiles_id_fkey/i);
    expect(all).toMatch(/alter\s+column\s+id\s+set\s+default\s+gen_random_uuid\(\)/i);
  });

  it("creates no Supabase Auth user anywhere in the seed", () => {
    const seed = readFileSync(join(process.cwd(), "supabase", "seed.sql"), "utf8");
    const bare = withoutComments(seed);
    expect(bare).not.toMatch(/insert\s+into\s+auth\.users/i);
    expect(bare).not.toMatch(/insert\s+into\s+auth\.identities/i);
    expect(bare).not.toMatch(/crypt\s*\(/i);
    // The word may appear in the header comment explaining why it is gone,
    // but never in a statement.
    expect(bare).not.toContain("password123");
  });

  it("mints no password in the Supabase store", () => {
    const store = readFileSync(join(process.cwd(), "lib", "store", "supabase.ts"), "utf8");
    const code = withoutComments(store).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain("password123");
    expect(code).not.toMatch(/auth\.admin\.createUser/);
    // Deleting one is still right for an account that predates migration 31.
    expect(store).toMatch(/auth\.admin\.deleteUser/);
  });
});
