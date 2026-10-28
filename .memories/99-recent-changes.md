# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 28 October 2026 (third) - the Google sign-in plan

**No application code changed.** The owner asked for a plan: the current state
of Google OAuth, the step-by-step setup, anything else worth knowing - with
the standing fact that **the institute's email data for every user is being
collected** - and for `.memories/` to be corrected where it has drifted.

### The finding

**The flow was already built.** `lib/oidc.ts` and the two routes under
`app/api/auth/google/` are a complete, verified OpenID Connect
implementation from Phase 8: authorization code with **PKCE**, `state` and
`nonce` in a short-lived httpOnly cookie, the `id_token` **verified** against
Google's JWKS with `iss` / `aud` / `exp`, `email_verified`, **both** domain
checks (`isInstituteEmail` on the address *and* the `hd` claim), a profile
that must already exist, then a `sessions` row and an audit entry.

**Three places said it was not built**, and each would have sent a later
session off to build it again. Setting it up is a client id, three
environment variables, and the accounts - not code.

### What was written

| File | What |
| --- | --- |
| **[`GOOGLE-SIGN-IN.md`](../GOOGLE-SIGN-IN.md)** (new, repo root) | The runbook. §1 what exists and what it already gets right · §2 the switch · §3 the Google Cloud steps and the exact redirect URI · §4 the portal side, and why **not in CI** · §5 the two domains · §6 **the email data** · §7 the 1000-row blocker, with the fix · §8 six smaller notes · §9 the auto-provisioning decision · §10 a fifteen-item verification checklist · §11 the email to send the Computer Centre |

A **root file, not a sixteenth memory file**: fifteen is a hard rule, and this
is a runbook performed once against an external party, like
[`DATA-REQUEST-AND-IMPORT.md`](../DATA-REQUEST-AND-IMPORT.md). What the code
*does* stays in [05-credentials-and-security.md](05-credentials-and-security.md)
Part 2; what is *open* in [03-roadmap.md](03-roadmap.md); what production must
*set* in [04-production.md](04-production.md). The runbook links to all three.

### The drift, and where it was

`npm run check:memories` passed before this round and passes after it, and the
folder's *facts* were right - Part 2 of file 05 has carried the Google leg in
its flow diagram all along. **What had drifted was prose the check cannot
read:**

| File | Said | Now |
| --- | --- | --- |
| `lib/env.ts` | "Google sign-in is **not built yet**" | Built, **unconfigured** |
| `lib/site.ts` | `isInstituteEmail` "is the rule real Google sign-in **must** enforce ... neither needs it today" | It **already enforces** it - plus the `hd`/students warning |
| `AGENTS.md` | "the real flow **must enforce** `isInstituteEmail()`" | A bullet for the Google door: what it checks, the derived redirect URI, the two defects, "don't set these in CI" |
| `.env.example` | the card's "**second** button"; a button reading "**Mock Authentication**"; `MOCK_LOGIN=false` leaving "LDAP sign-in only"; a link to `.memories/11-ldap-accounts.md` | One button, reading "Sign in"; `MOCK_LOGIN=false` **leaves no door at all**; the link points at file 05, which has owned those accounts since 10 Oct - **the old link had been dead for eighteen days** |

### Two defects found, recorded not fixed

The ask was a plan, so both are written down rather than patched.

**1. The account lookup scans every profile - roadmap [gate 12](03-roadmap.md).**
`app/api/auth/google/callback/route.ts` does
`(await getStore().listProfiles()).find(...)`, and `SupabaseStore.listProfiles`
is `select("*").order("role")` with **no `.range()`**. Supabase caps an
unbounded select at **1000 rows by default and truncates silently** - HTTP 200,
the truth only in `Content-Range`. Past 1000 accounts:

- **sign-in fails for arbitrary people** (Google and LDAP both) with "not
  registered on the guest house portal" - indistinguishable from a genuinely
  absent account, so the person goes to the office, not to the developer;
- **the account import breaks**: `planUserImport` builds its "who already
  exists" map from the same truncated list, so a second batch reads
  already-imported people as **new** and the unique `email` constraint refuses
  the whole paste. `MAX_USER_IMPORT_ROWS` is 2000 and
  [`DATA-REQUEST-AND-IMPORT.md`](../DATA-REQUEST-AND-IMPORT.md) §7 says to
  **split the file** - the documented procedure walks into the defect;
- Users & Roles, the mail digest, the approval routing and the Copy-to line
  all read the same call.

Fix both ways: raise Supabase's **Max rows** (a new project defaults back to
1000, so it belongs on the deployment checklist) **and** add
`getProfileByEmail` to `DataStore` and both stores. **Migration 31 already
added `profiles (lower(email))` for exactly this, and nothing has used it
since 13 Oct 2026.**

**2. `hd` on the start leg is narrower than the return leg's own rule.** The
start leg sends `hd=iitpkd.ac.in`; the return leg accepts that **and any
subdomain**. Students are `<roll>@smail.iitpkd.ac.in`. If `smail` is a
separate Workspace tenant rather than a second domain of the same one, that
hint keeps **every student** out of Google's account chooser - the portal
would work for staff and be unusable for the people it is for. One line to
fix (`hostedDomain: "*"`, or drop the hint - `hd` is a hint, not a control,
and the callback re-checks), but it must not be guessed: it is the first
question in the email to the Computer Centre, and one real student account
settles it.

### Files touched

| File | Change |
| --- | --- |
| `GOOGLE-SIGN-IN.md` | **New.** The runbook |
| `lib/env.ts`, `lib/site.ts` | **Comments only** - no behaviour |
| `AGENTS.md` | The Google door bullet replaces the stale clause |
| `.env.example` | The Sign-in block rewritten; the dead memory link fixed |
| `.memories/03-roadmap.md` | Gate 2 rewritten, **gate 12 added**, §2n added |
| `.memories/04-production.md` | **Max rows** on the deployment checklist; the Computer Centre asks now name the two-domains question and the Workspace user export |
| `.memories/05-credentials-and-security.md` | Part 2 gains **"Google sign-in - built, verified, unconfigured"** |
| `.memories/20-architecture.md` | The auth seam notes the Google leg is built, with the pointer |
| `.memories/01-background.md`, `02-decisions.md`, `99-recent-changes.md` | This round |

**No migration, no store operation, no booking rule, no permission, no route
and no public-site change.**

### Verified

`npm run lint`, `npx tsc --noEmit`, `npm test` (**608**) and
`npm run check:memories`. No new tests: nothing executable changed - the two
code edits are comments.

### Left open

- **Gate 12 is the next thing to do**, and it is a prerequisite for the
  institute's import as much as for Google sign-in.
- **Email is the only identity key.** `completeGoogleSignIn` returns Google's
  immutable `sub` and the callback drops it, so a **reassigned** institute
  address hands the new holder the previous person's profile, bookings and
  role. `profiles.google_sub` (a migration 35) is the fix - worth doing before
  the portal holds a year of real bookings. [03-roadmap.md](03-roadmap.md) §2n.
- **The OAuth state cookie is not cleared** - set with
  `path: "/api/auth/google"`, deleted with a bare `jar.delete()`, which
  defaults to `/`. Low severity, one line.
- **Configuring Google deletes `/mock-login`, which is how all 50 Playwright
  journeys sign in.** `e2e/sign-in.spec.ts` says it expects to be *replaced*
  at that point; nothing replaces it yet.
- **The 29 other `listProfiles()` callers** are correct once Max rows is
  raised, but several load every profile to find a handful of approvers.
  Speed, not correctness.
- **The refusal message for a valid account with no profile is a dead end.**
  Naming the office's address from `GUEST_HOUSE_CONTACT` would give the person
  somewhere to go.
