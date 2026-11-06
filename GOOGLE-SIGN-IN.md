# Google sign-in — the current state, and how to turn it on

Everything needed to put the portal behind the institute's Google accounts:
what is already built, what to ask the Computer Centre for, the exact steps,
and the two things that will break if they are not fixed first.

Written 28 October 2026, against the code as it stands on `main`
(commit `7540776`). Companion to
[`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md), which is about
getting people's details *into* the portal; this one is about letting them
*in*.

---

## 0. The one-screen version

**The flow is already written.** Authorization code + PKCE, a verified
`id_token`, the institute-domain check, a session row. It was built in Phase 8
and has never been switched on. There is **no application code to write** for
the happy path.

**Turning it on is four things:**

| # | Thing | Who | Effort |
| --- | --- | --- | --- |
| 1 | An OAuth 2.0 client (client id + secret) for `iitpkd.ac.in` | Computer Centre / whoever owns the Workspace | A request, then a wait |
| 2 | Three environment variables on the deployment | You | Minutes |
| 3 | **A `profiles` row for every person who will sign in** | The office, via Users & Roles → Import from spreadsheet | The long pole |
| 4 | **Fix the 1000-row account lookup first** (§7) | You | An afternoon |

**Setting the three variables closes the mock door by itself** — there is no
flag to remember to unset. That is deliberate (`mockLoginEnabled()`).

**The two traps, in one line each:**

- **§7** — the callback finds your account by loading *every* profile and
  searching it in memory. Supabase truncates that at 1000 rows **silently**.
  With the college imported, sign-in starts failing for arbitrary people, and
  the account import hits a wall at the same number.
- **§6** — the match is `profiles.email` against Google's verified `email`
  claim, **exact**. The email column you are collecting has to be each
  person's **Google primary address**, or they get "not registered on the
  guest house portal" and go to the office rather than to you.

---

## 1. What is already built

| File | What it does |
| --- | --- |
| [lib/oidc.ts](lib/oidc.ts) | The protocol. `startGoogleSignIn()` mints state + PKCE + nonce and builds the authorize URL; `completeGoogleSignIn()` exchanges the code and **verifies** the `id_token` |
| [app/api/auth/google/start/route.ts](app/api/auth/google/start/route.ts) | Leg one: rate-limit, remember state/verifier/nonce/`next` in an httpOnly cookie scoped to `/api/auth/google`, redirect to Google |
| [app/api/auth/google/callback/route.ts](app/api/auth/google/callback/route.ts) | Leg two: match the state, exchange the code, check the identity, find the profile, start the session, audit it |
| [lib/env.ts](lib/env.ts) `googleOauth()` | The switch. Returns null unless all three variables are set |
| [components/login-form.tsx](components/login-form.tsx) | The button. Becomes *Sign in with Google* with the Google mark when configured |
| [lib/site.ts](lib/site.ts) `isInstituteEmail()` | The domain rule: `iitpkd.ac.in` and any subdomain of it |

No OAuth library is involved — it is `fetch` and Node's `crypto`, on purpose
(an authentication dependency is a supply-chain risk of its own).

### What it already gets right

Worth knowing, because none of it needs re-deciding:

- **PKCE (S256) and `state`**, both in an httpOnly cookie with a 10-minute
  life. A code intercepted on the way back is useless without the verifier,
  and a sign-in cannot be started from another site.
- **The `id_token` is verified, not decoded.** Signature against Google's
  JWKS (cached an hour), `alg` must be RS256, `iss` one of Google's two,
  `aud` equal to our client id, `exp` in the future, `nonce` equal to the one
  this request sent.
- **`email_verified` must be true.**
- **Two domain checks**: the `hd` claim (the account really belongs to a
  Workspace domain) *and* `isInstituteEmail()` on the address itself.
- **A profile must already exist.** A valid institute Google account with no
  `profiles` row gets in nowhere.
- **The session is the portal's own** — a row in `sessions`, an opaque cookie,
  30 minutes idle and 12 hours absolute. Google is only asked *who is this*.
- **Both outcomes are audited** (`signin.success` / `signin.failure` with
  `method: "google"` and a reason).
- **Rate limited** per IP on the start leg (20 per 10 minutes).
- **`?next=` survives the round trip**, through `safeNextPath()` at the start
  leg, so *Book a room* → sign in → the booking form still works.
- **No refresh token and no offline access.** We want an identity once, not
  an API token. Nothing to store, nothing to leak.

### What it does not do

- **It does not create accounts.** See §9.
- **It does not remember the Google account id** (`sub`). It matches on email
  only. See §8.1 — this is the one design gap worth a decision.

---

## 2. The switch: what "configured" means

`googleOauth()` returns a config only when **all three** of these are set:

```
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
APP_URL                 # e.g. https://guesthouse.iitpkd.ac.in
```

The redirect URI is **derived, never configured**:

```
${APP_URL}/api/auth/google/callback
```

`APP_URL` has any trailing slash stripped. `NEXT_PUBLIC_APP_URL` is accepted
as a fallback.

What flips when all three are present:

| | Google unconfigured (today) | Google configured |
| --- | --- | --- |
| The button | *Sign in* | *Sign in with Google*, with the Google mark |
| Where it goes | `/mock-login` (the persona picker) | `/api/auth/google/start` |
| `/mock-login` | Open — **anyone reaching it becomes any account** | **Gone.** `mockLoginEnabled()` is false |
| Line under the button | "Google sign-in is not connected yet…" | nothing |

> **Watch for the silent fallback.** A malformed `APP_URL` makes `appUrl()`
> return null, which makes `googleOauth()` return null, which **reopens the
> mock door** rather than erroring. In production `assertEnv()` refuses to
> start when `APP_URL` is missing or not a URL, so the silent case is a
> staging or dev deployment where `NODE_ENV` is not `production`. Check the
> button actually says "with Google" after deploying.

> **Never set `MOCK_LOGIN=false` while Google is unconfigured.** The LDAP form
> came off the page on 28 Oct 2026, so that combination leaves **no door at
> all** — the panel reads "Sign-in is not configured on this deployment."

---

## 3. Step by step — the Google Cloud side

### 3.1 First, settle who owns the client

This is a request to the institute, not a self-service step.
[`.memories/04-production.md`](.memories/04-production.md) already has it on
the list for `netadmin@iitpkd.ac.in`, and it notes the request needs a named
requesting department — get the Administration Section to co-sign.

Ask for, in one email:

1. **Confirmation that `iitpkd.ac.in` is Google Workspace.** Near-certain (the
   institute runs Google Sites on it) but confirm rather than assume.
2. **Whether `smail.iitpkd.ac.in` is the same Workspace** — a secondary domain
   of the same tenant — **or a separate one.** This changes the setup; see §5.
3. **An OAuth 2.0 Web application client**, with the redirect URI in §3.4, or
   permission for you to create one in a project inside their organisation.
4. **Whether they would rather you used a central SSO** they already run. They
   may not want a new OAuth client at all.

### 3.2 The OAuth consent screen

In [Google Cloud Console](https://console.cloud.google.com) → **APIs &
Services → OAuth consent screen**:

| Field | Value | Why |
| --- | --- | --- |
| User type | **Internal** | If the project sits inside the institute's Workspace organisation. Internal means **no Google verification review**, and only institute accounts can use it at all — a second lock behind our own domain check |
| App name | `IIT Palakkad Guest House Portal` | Shown on the consent screen |
| Support email | the guest house office or `netadmin@` | Shown to users |
| App domain / home page | `https://guesthouse.iitpkd.ac.in` | |
| Authorised domain | `iitpkd.ac.in` | |
| Developer contact | your address | Google's own notices |

**Scopes: add nothing.** The flow asks for `openid email profile`, which are
the three non-sensitive base scopes. They need **no Google security review**
and no annual re-verification. Do not add Directory, Gmail or Calendar scopes
— the portal reads none of them, and adding one turns a 10-minute setup into
a verification process.

If the project has to be **External** (because the institute will not host it
internally, or because students are in a separate tenant — §5), it still needs
no review while the scopes stay non-sensitive, but it will sit in *Testing*
with a 100-user cap until you press **Publish**. Publish it before go-live.

### 3.3 Create the client

**APIs & Services → Credentials → Create credentials → OAuth client ID.**

- **Application type: Web application.**
- Name it something a successor will recognise: `Guest House Portal (prod)`.

### 3.4 Authorised redirect URIs

Add these **exactly** — Google matches the full string, including scheme, host,
port and path:

```
https://guesthouse.iitpkd.ac.in/api/auth/google/callback
http://localhost:3000/api/auth/google/callback
```

- Substitute the real production host. Whatever you use must equal
  `APP_URL` + `/api/auth/google/callback`, character for character.
- `http://` is allowed **only** for `localhost`.
- Add a staging URI too if there is one, or use a second client for staging
  (cleaner: a leaked staging secret then does not open production).
- **Authorised JavaScript origins: leave empty.** The flow is a server-side
  redirect; no browser JavaScript talks to Google.

### 3.5 Keep the secret out of git

Copy the client id and secret into the deployment's secret store (Vercel
environment variables, or the VM's systemd unit / `.env` with `600`
permissions). `.env.local` is gitignored, and
[`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md)
Part 3 is where it gets recorded **by name and place only, never a value**.

---

## 4. Step by step — the portal side

### 4.1 Set the variables

```bash
GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<secret>
APP_URL=https://guesthouse.iitpkd.ac.in
```

Mark `GOOGLE_CLIENT_SECRET` **server-only** on the host — it must never reach
a `NEXT_PUBLIC_*` name or the client bundle.

### 4.2 Restart, and look at the button

`googleOauth()` is read per request, but `APP_URL` reaches the mail module and
`assertEnv()` runs at boot, so restart rather than reload. Then open
`/sign-in`: the button must read **Sign in with Google** and carry the Google
mark. If it still says *Sign in*, one of the three variables is missing or
`APP_URL` is not a valid URL (§2).

### 4.3 Do not configure Google in CI

The Playwright suite signs in through the account picker — `signIn()` in
[e2e/helpers.ts](e2e/helpers.ts) clicks a persona's button at `/mock-login`.
Configuring Google removes that page and **all 50 journeys fail**. CI is
deliberately run with no secrets at all; keep it that way.
[e2e/sign-in.spec.ts](e2e/sign-in.spec.ts) says in its own header that it is
expected to be *replaced* at this point, not fixed. Replacing it means
mocking Google's endpoints or testing the callback's rejections directly — the
happy path cannot be driven without a real Google account.

---

## 5. The two domains — and the one setting that can lock students out

> **Done on 5 Nov 2026:** the start leg sends `hd=*`, and the return leg accepts exactly
> `iitpkd.ac.in` and `smail.iitpkd.ac.in`, no other subdomain. Still test a real student.
> §7.1's `listProfiles` pages now too, so §7.3(a) is no longer required for accounts.

Staff are `name@iitpkd.ac.in`. **Students are `<roll>@smail.iitpkd.ac.in`.**

The two legs of the flow treat that differently, and the asymmetry is
deliberate on the return leg but a hazard on the way out:

| Leg | What it does with the domain |
| --- | --- |
| **Start** | Sends `hd=iitpkd.ac.in` to Google — a **hint** that narrows the account chooser |
| **Return** | Accepts `iitpkd.ac.in` *and any subdomain*, via `isInstituteEmail()`, and checks the `hd` claim the same way |

So the return leg admits students. The question is whether the start leg's
`hd` hint lets them get that far.

- If `smail.iitpkd.ac.in` is a **secondary domain of the same Workspace
  tenant**, `hd=iitpkd.ac.in` identifies the *tenant* and students are offered
  their accounts normally. Nothing to change.
- If it is a **separate tenant**, `hd=iitpkd.ac.in` filters student accounts
  **out of the chooser** and no student can sign in. The portal would work
  perfectly for staff and be unusable for the people it exists for.

**Test this with one real student account before go-live.** It is the single
highest-value verification step in this document.

If it does block them, the fix is one line in
[app/api/auth/google/start/route.ts](app/api/auth/google/start/route.ts):

```ts
// Either drop the hint entirely - the real check is on the way back:
const start = startGoogleSignIn(config);

// ...or ask for "any Workspace domain, no personal accounts":
const start = startGoogleSignIn(config, { hostedDomain: "*" });
```

Neither weakens anything. `hd` is **a hint, not a control** — Google says so,
the code's own comment says so, and the callback re-checks the claim and the
address regardless. `hd="*"` is the better of the two: it still keeps personal
`@gmail.com` accounts out of the chooser.

A separate tenant also means **one OAuth client cannot be Internal to both.**
Ask the Computer Centre whether they want one External client covering both
domains, or a client per tenant (which the code does not support today — it
reads one `GOOGLE_CLIENT_ID`).

---

## 6. The email data you are collecting — what the portal needs it to be

This is where a sign-in rollout usually goes wrong, and it is decided by the
spreadsheet, not by the code.

### 6.1 The match is exact

[app/api/auth/google/callback/route.ts](app/api/auth/google/callback/route.ts):

```ts
const profile = (await getStore().listProfiles())
  .find((p) => p.email.toLowerCase() === identity.email);
```

`identity.email` is Google's **verified `email` claim**, lowercased. There is
no fuzzy match, no roll-number fallback, no "did you mean". A person whose
`profiles.email` is one character different from their Google primary address
sees:

> That account is not registered on the guest house portal. Please contact the
> guest house office.

They will believe it, and they will go to the office. **This will be your
whole support load if the email column is wrong**, and the office cannot tell
it apart from a person who genuinely has no account.

### 6.2 So collect the Google primary address

Not an HR record, not a display address, not a departmental alias, not a
personal address. The **primary address of the Google account the person will
click**.

**Ask the Computer Centre for the Workspace user export** rather than
assembling the list from HR or the academic office: Admin console → Users →
Download users gives primary addresses and aliases, which is exactly the
column the match needs. Everything else is a transcription of it.

If you only get an HR sheet, ask these three questions about it:

| Question | Why it matters |
| --- | --- |
| Is this the Google **primary**, or could it be an alias? | Google returns the primary in the `email` claim. An alias row will never match |
| For students, is `<roll>@smail.iitpkd.ac.in` the Google account, or only a **mail-routing** address? | If routing-only, the real primary is something else and no student matches |
| Are there people with **two** institute addresses? | Pick the one they sign in with; the other will fail |

### 6.3 Aliases are not handled

If a person has `r.name@iitpkd.ac.in` as an alias of `name@iitpkd.ac.in`,
Google returns the **primary** whichever they typed, so only the primary needs
to be in `profiles.email`. But the portal has no alias table: if the office
imported the alias, sign-in fails. One address per person, and it must be the
primary.

### 6.4 Everyone who signs in needs a row, before they try

There is no auto-provisioning (§9). So the import has to precede go-live, and
there is an ongoing job: a new member of staff or a new batch of students
cannot sign in until somebody imports them.
[`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md) is the procedure;
§7 below is what to fix before running it at full size.

### 6.5 What *not* to collect

[`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md) §9 is the list, and
it applies with more force here: sign-in needs **the email address and
nothing else**. A column the portal has no field for is a column that becomes
a liability at the first subject-access request under the DPDP Act, 2023.
Delete the extra columns before the file is copied anywhere.

---

## 7. Fix this before importing the college — the 1000-row lookup

**This is a blocker, not a nice-to-have.**

### 7.1 What the code does

`listProfiles()` in [lib/store/supabase.ts](lib/store/supabase.ts):

```ts
const { data, error } = await this.db.from("profiles").select("*").order("role");
```

No `.range()`, no `.limit()`. **Supabase caps an unbounded select at 1000 rows
by default and truncates silently** — HTTP 200, no error, the truth only in
the `Content-Range` header, which `supabase-js` does not surface. The order is
`role`, so *which* 1000 come back is arbitrary within each role.

The Google callback loads that array and searches it in memory. So does LDAP
sign-in, via `profileForDirectoryEntry()`.

### 7.2 What breaks, at about the 1001st account

| Where | Symptom |
| --- | --- |
| **Google sign-in** | "That account is not registered on the guest house portal" for arbitrary people. Indistinguishable from a wrong email address |
| **LDAP sign-in** | Same, via `lib/ldap/link.ts` |
| **The account import** | `planUserImport` builds its "who already exists" map from the same truncated list. A second batch reads already-imported people as **new**, tries to create them, and the unique `email` constraint refuses — all or nothing, so the whole paste fails |
| **Users & Roles** | Shows only part of the directory |
| **Mail** | `recipients.ts`, `digest.ts`, `copy-to.ts` all read it; an approver outside the window stops being found |

The import path is the cruel one. `MAX_USER_IMPORT_ROWS` is **2000**, and
[`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md) §7 tells you the
institute is larger than that and to **split the file** — which walks straight
into this. At least it fails loudly.

### 7.3 Do both of these

**(a) Raise the cap on the project.** Supabase Dashboard → Settings → API →
**Max rows**. Set it above the real headcount with room to spare (the ceiling
is 1,000,000). This unblocks the import and the console, and it is a
dashboard setting, so record it in
[`.memories/04-production.md`](.memories/04-production.md) — a new Supabase
project will default back to 1000.

**(b) Stop scanning the table to sign one person in.** Migration 31 already
added the index for this and **nothing uses it**:

```sql
create index if not exists profiles_email_lower_idx on public.profiles (lower(email));
```

Add one method to the `DataStore` interface and both implementations:

```ts
// lib/store/types.ts
getProfileByEmail(email: string): Promise<Profile | null>;

// lib/store/supabase.ts - uses profiles_email_lower_idx
async getProfileByEmail(email: string): Promise<Profile | null> {
  const { data, error } = await this.db
    .from("profiles").select("*").ilike("email", email).maybeSingle();
  if (error) throw error;
  return data;
}

// lib/store/mock.ts
async getProfileByEmail(email: string): Promise<Profile | null> {
  const wanted = email.trim().toLowerCase();
  return loadDb().profiles.find((p) => p.email.toLowerCase() === wanted) ?? null;
}
```

Then the callback becomes:

```ts
const profile = await getStore().getProfileByEmail(identity.email);
```

Remember the house rule: **any new data operation goes into the interface and
both stores**, or one backend silently breaks.

> `.ilike` with no wildcards is an equality match that the functional index
> can serve. Verify the plan rather than assuming — if PostgREST does not use
> the index, an RPC wrapping
> `select * from profiles where lower(email) = lower($1)` will.

**(c) Later, the other 29 callers.** Twenty-nine places call `listProfiles()`,
several on hot paths (the mail digest, approval routing, the booking page).
Raising Max rows makes them correct but not fast — the digest loads the whole
college to find a handful of approvers. That is a roadmap item, not a
prerequisite for Google sign-in; it is recorded in
[`.memories/03-roadmap.md`](.memories/03-roadmap.md).

---

## 8. Other things to note

### 8.1 Email is a weak identity key — consider storing Google's `sub`

`completeGoogleSignIn()` returns `subject` — Google's immutable account id —
and the callback **drops it**. Matching on email alone has a real failure
mode at an institute:

- A roll number is reused, or a staff address is reassigned after someone
  leaves. The new holder signs in and **inherits the previous person's
  profile**: their bookings, their history, their role, their hostel.
- A rename (`maiden@` → `married@`) silently locks the person out until the
  office edits the row.

The fix is small but needs a migration, so it is a decision rather than
something to slip in:

1. `profiles.google_sub text unique` (migration 35).
2. On sign-in: match `google_sub` first; fall back to email; **record the
   `sub`** on the row the first time an email match succeeds.
3. After that, a changed address follows the person automatically, and a
   reassigned address matches nobody.

Recommended before the portal holds a year of real bookings. Not required to
switch Google on, and deliberately **not** done here.

### 8.2 The OAuth state cookie is probably not being cleared

The start leg sets it with `path: "/api/auth/google"`; the callback clears it
with `jar.delete(OAUTH_COOKIE)`, which defaults to `path: "/"` and so does not
match. The cookie survives until its 10-minute `maxAge`.

Low severity — a code cannot be exchanged twice, and the nonce ties the token
to that one attempt — but it is one line:

```ts
jar.delete({ name: OAUTH_COOKIE, path: "/api/auth/google" });
```

### 8.3 Rate limiting is per IP

`RATE_LIMITS.oauth` is 20 starts per 10 minutes **per IP**. If the campus sits
behind one NAT address, a busy morning could trip it and the message is
"Too many sign-in attempts". Watch it after go-live; the counter is a database
row (`lib/security.ts`), so raising it is a constant.

### 8.4 No CSP change is needed

`form-action 'self'` in [proxy.ts](proxy.ts) restricts form submissions; the
Google leg is a top-level GET navigation and a redirect, which CSP does not
govern. `frame-src` is irrelevant — nothing is framed. The flow needs no
header change, which is worth knowing because it looks like it should.

### 8.5 Sessions, timeouts and the developer's second factor

Unchanged by Google. 30 minutes idle, 12 hours absolute; the token rotates on
sign-in. Re-authentication after an idle timeout is a redirect the browser
usually completes without a click, so the short idle window costs users less
under Google than it did under a password form. The `developer` role still
needs its TOTP step-up for role changes, Settings and deletes — Google
sign-in does not satisfy it.

### 8.6 The console password is separate

`/admin` sits behind its own shared console password, still **`0000`** until
someone changes it. Google sign-in does not touch it. Change it before
go-live — it is its own roadmap gate.

### 8.7 LDAP stays available underneath

`signInWithLdap`, the throttle, `lib/ldap/` and *Import LDAP usernames* are
all intact; only the form is off the page. If the institute later prefers its
directory, the door is a form away —
[`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md)
Part 2 has the switch. The two can coexist: both end in the same `sessions`
row.

---

## 9. One decision to make: what happens to a valid account with no profile

Today: refused, with a message telling them to contact the office. The
alternative is to create a profile on first sign-in.

| | Keep the wall (today) | Auto-provision |
| --- | --- | --- |
| Who can get in | Only people the office imported | Anyone with an institute Google account |
| Role | Set deliberately, by the office | Needs a default — `student`? `employee`? — and it drives **which budget they may charge** and **who approves them** |
| Hostel / unit / roll number | Imported, so warden routing and the academic-record lock work | Empty, so a student has no warden and their parents are not locked |
| Failure mode | A legitimate person is turned away | A wrong role or a missing hostel routes a booking to nobody |

**Recommendation: keep the wall.** A `profiles` row is not just an identity in
this portal — it carries the role, the hostel and the unit, which decide the
approval chain and the debitable heads. There is no safe default for those.
The import is the right place for that decision, and it has an undo
(migration 32).

What to improve instead: the refusal message is a dead end. Consider naming
the office's email address in it, from `GUEST_HOUSE_CONTACT` (`lib/site.ts`),
so the person has somewhere to go.

Related questions worth settling with the office at the same time:

- Does **everyone** at the institute get an account, or only people who book?
- What happens when someone leaves? `profiles` rows persist until removed, and
  a Google account that is suspended simply stops signing in — the row stays,
  with its bookings. That is the right behaviour for history; decide who
  prunes it and when.

---

## 10. Verification checklist

In this order. Items 1-4 need no Google configuration.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `npm run check:migrations` | Reports what the hosted project has. 31 cannot be probed and matters most |
| 2 | Supabase → Settings → API → **Max rows** | Above the real headcount (§7.3a) |
| 3 | `getProfileByEmail` added to the interface and **both** stores (§7.3b) | `npm run lint`, `npx tsc --noEmit`, `npm test`, a build — all clean |
| 4 | Import a batch, then **re-paste the same sheet** | Everything reads `unchanged`. If rows read as new, the truncation is still biting |
| 5 | Set the three variables, restart, open `/sign-in` | The button reads **Sign in with Google** and shows the mark |
| 6 | **A staff account** signs in | Lands on that role's home page |
| 7 | **A real student account** (`@smail.…`) signs in | Lands on `/book`. **If the chooser does not offer the account at all, see §5** |
| 8 | A personal `@gmail.com` account | "Use your @iitpkd.ac.in account - personal Google accounts cannot sign in." |
| 9 | An institute account with **no** profile row | "not registered on the guest house portal" |
| 10 | Cancel at Google's consent screen | "Sign-in was cancelled." |
| 11 | Open `/api/auth/google/callback?code=x&state=y` directly | "That sign-in did not match the one that was started" |
| 12 | Visit `/mock-login` | **404.** If it renders, one of the three variables is unset |
| 13 | `/book-room` → sign in | Lands on `/book`, not on a dashboard (`next` survived) |
| 14 | Console → Audit Log | `signin.success` with `method: "google"`; the failures above are recorded too |
| 15 | Sign in, wait past 30 minutes idle, act | Sent back to sign-in; signing in again is one redirect |

Record the outcome of 6, 7 and 12 in
[`.memories/04-production.md`](.memories/04-production.md) — they are the
three that cannot be checked again without a real deployment.

---

## 11. The email to send the Computer Centre

Short version of §3.1, ready to adapt. Send it with the data request in
[`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md) §6 rather than
separately.

> We are deploying the Guest House Booking Portal for the Administration
> Section and would like staff and students to sign in with their institute
> Google accounts. We need:
>
> 1. Confirmation that `iitpkd.ac.in` is Google Workspace, and whether
>    `smail.iitpkd.ac.in` is a domain of the same Workspace or a separate one.
> 2. An OAuth 2.0 Web application client (client id and secret) in an
>    institute-owned Google Cloud project, with the authorised redirect URI
>    `https://<host>/api/auth/google/callback`. The application requests only
>    the `openid`, `email` and `profile` scopes — no Directory, Gmail or
>    Calendar access — so it needs no Google verification review.
> 3. An export of Workspace users (primary addresses), so that portal accounts
>    match the addresses people actually sign in with.
> 4. Whether a central SSO already exists that you would prefer we use.
> 5. The subdomain `guesthouse.iitpkd.ac.in` and a TLS certificate.

---

## Where this is recorded in the project memory

| Question | File |
| --- | --- |
| How sign-in works today, every login, the LDAP switch | [`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md) Part 2 |
| Which variables production must set, and the deployment order | [`.memories/04-production.md`](.memories/04-production.md) §1a.1 and §6 |
| Closing Mock Authentication as a go-live gate | [`.memories/03-roadmap.md`](.memories/03-roadmap.md) §1 |
| What the sign-in page looks like and why | [`.memories/14-public-site-and-ui.md`](.memories/14-public-site-and-ui.md) |
| What to ask the institute for, per kind of user | [`DATA-REQUEST-AND-IMPORT.md`](DATA-REQUEST-AND-IMPORT.md) |
