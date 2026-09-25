# Security

What protects the portal, where each control lives, and what to do when
something goes wrong. Written for whoever runs this after us — the office's IT
staff as much as a developer.

Design decisions and why they were taken are in
[03-decisions.md](03-decisions.md#phase-8-security-22-sep-2026); this page is
the operational view.

---

## 1. What we are protecting

| Asset | Why it matters |
| --- | --- |
| Guests' identity numbers and ID documents | Aadhaar and passport numbers, uploaded ID cards. Personal data under the DPDP Act. |
| Who stayed where, and when | A guest register is a record of people's movements. |
| Invoices and payments | The institute's financial record. Numbered, and immutable once issued. |
| Staff accounts and roles | Whoever can change roles can approve anything. |
| The service-role key | It bypasses row-level security entirely. |

**The single most dangerous secret is `SUPABASE_SERVICE_ROLE_KEY`.** It reads
and writes every table with no policy in its way. It is set on the server only,
never exposed to the browser, never logged, and never committed.

---

## 2. The controls, in order of what they stop

### Authentication

- **LDAP** against the institute directory (`lib/ldap/`), or **Google sign-in**
  restricted to institute domains (`lib/oidc.ts`: state + PKCE, the id_token
  verified against Google's JWKS — signature, issuer, audience, expiry, nonce —
  then `email_verified`, the `hd` claim, and finally an existing portal
  account). No portal passwords exist to steal.
- **Sessions are rows** (`sessions`, migration 21). The cookie holds 32 random
  bytes; only its SHA-256 is stored, so a database dump cannot be replayed as a
  login. 30 minutes idle, 12 hours absolute, revocable one at a time or all at
  once, rotated whenever a session gains privilege. `__Host-gh_session` in
  production. `lib/auth.ts` is the only reader.
- **Mock Authentication** — the one-click persona picker (`/mock-login`,
  `loginAs`) — is open **whenever Google sign-in is not configured, production
  included** (`mockLoginEnabled()`, 23 Sep 2026: the office's demo deployment
  needs it). Configuring Google closes it; `MOCK_LOGIN=false` closes it early.
  **Anyone who reaches it can become any account**, so a deployment holding
  real bookings must do one or the other. `lib/env.ts` separately refuses to
  boot production with `DEV_LOGIN` set (the legacy `gh_mock_user` cookie door).
- Sign-in attempts: 8 per username per 15 minutes; console unlock 6 per 15
  minutes; second-factor codes 10 per 10 minutes — all counted in the database.

### Authorisation

- Every server action re-checks the caller server-side. The UI hiding a button
  is a courtesy, never the control.
- The developer console is behind its own password **and** a second factor:
  TOTP (`lib/totp.ts`), with ten recovery codes kept only as scrypt hashes.
  Role changes, Settings and every delete need the code proved again within ten
  minutes (`stepUpProblem`).
- Row-level security is on for every table, with no `authenticated` write
  policy — which is what makes the public anon key safe to ship. **The server
  still uses the service-role key** (see §6).

### Data at rest

- Identity numbers and TOTP secrets are encrypted with AES-256-GCM
  (`lib/crypto.ts`), the key version stored in the value so
  `ID_ENCRYPTION_KEYS_OLD` can carry old rows through a rotation. Screens and
  exports show the last four digits only.
- Uploaded documents live outside `public/`, are named randomly, have their
  EXIF and PNG text chunks stripped, and are typed by their **bytes**, not
  their filename. Optional ClamAV (`CLAMAV_HOST`); a configured-but-unreachable
  scanner refuses the upload rather than storing it unscanned.
- Documents are served only by `/api/documents/…`, which checks who is asking,
  writes a `document.viewed` audit row, and signs a five-minute link.

### Data in transit and in the browser

- `proxy.ts` sets, on every response: a Content-Security-Policy with a
  per-request nonce and `strict-dynamic`, HSTS (production only),
  `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`,
  Referrer-Policy, Permissions-Policy, COOP, CORP, and `X-Robots-Tag: noindex`
  on every portal path.
- `style-src` still allows `'unsafe-inline'`: the charts position bars with
  `style=` attributes, which a nonce cannot cover.

### Abuse

- Throttles live in the database (`hit_rate_limit`), so a restart does not
  reset a brute-force counter and every instance shares one. Routes answer
  **429** with `Retry-After`.
- The cron endpoints take a bearer secret in the Authorization header. A GET is
  accepted only when it also carries Vercel's `x-vercel-cron` header. **A
  secret never travels in a query string** — that is written to every access
  log it passes.

### Accountability

- `security_audit` records sign-ins (success and failure), console unlocks,
  role and settings changes, document views, exports, invoice actions,
  overrides, second-factor events and privacy requests. Append-only; readable
  at Console → Audit Log.
- `lib/log.ts` writes structured JSON with emails, long digit strings and
  secrets redacted, and posts to Sentry when `SENTRY_DSN` is set.

### Retention and privacy (DPDP)

- A versioned privacy notice at `/privacy`, a consent tick on the booking form
  stored with the notice's version, "Download my data" and "Ask for erasure"
  on the dashboard, and the office answering each request from Console →
  Security.
- `lib/retention-server.ts` runs nightly: identity fields and their documents
  are erased `id_retention_days` (Setting, default 365) after a stay ends, and
  the audit log is trimmed to `audit_retention_days` — which the database will
  not let fall below 180.
- Erasure is a **request**, not a switch. Records the guest house must keep for
  audit cannot be erased, and the answer says so.

---

## 3. Secrets, and where each one lives

| Secret | Where it is set | If it leaks |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Hosting provider's environment only | Rotate immediately in Supabase → Settings → API, redeploy, then read the audit log for what was done with it |
| `ID_ENCRYPTION_KEY` | Hosting provider's environment | Generate a new one, move the old value into `ID_ENCRYPTION_KEYS_OLD`, redeploy; rows re-encrypt as they are written |
| `CRON_SECRET` | Hosting provider + the cron configuration | Rotate and redeploy; the endpoints refuse the old value at once |
| `MAIL_APP_PASSWORD` (or `MAIL_PASSWORD`) | Hosting provider | Rotate with the institute's mail administrator (today a Gmail app password) |
| `GOOGLE_CLIENT_SECRET` | Hosting provider | Rotate in the Google Cloud console |
| LDAP service password | Hosting provider | Rotate with the directory administrators |

`.env` and `.env.local` hold real values on a developer's machine. They are
git-ignored, and `.gitleaks.toml` has rules for the service-role key, the mail
password, the cron secret and the encryption key. **Never commit one, never log
one, never paste one into an issue.**

---

## 4. If something goes wrong

1. **Contain.** Rotate the secret involved (§3) and redeploy. Revoke sessions
   from Console → Security if an account is suspected.
2. **Find out what happened.** Console → Audit Log, filtered by event and time;
   the server logs; Supabase's own logs.
3. **Report.** A personal-data breach is reportable to **CERT-In within 6
   hours** of becoming aware of it, and to the Data Protection Board and the
   affected people under the DPDP Act. The institute's own incident process
   decides who files; the portal's part is the evidence. The runbook, with
   who to contact, is in
   [23-running-and-testing.md](24-deployment-runbook.md#incident-response).
4. **Write it down.** A short note in [25-troubleshooting.md](25-troubleshooting.md)
   — what happened, what was done, what would have prevented it.

`public/.well-known/security.txt` tells a finder where to report a
vulnerability. Keep its `Expires` date current.

---

## 5. Keeping it healthy

- `npm audit` on every dependency change; Dependabot groups Next's packages.
- Node is pinned by `.nvmrc` and `engines`.
- CI runs lint, types, unit tests and the end-to-end journeys **with no
  secrets at all** — nothing in CI can reach the hosted project, by
  construction.
- Migrations are tested in a throwaway Postgres before they are committed
  ([23-running-and-testing.md](23-running-and-testing.md#verifying-changes)).

---

## 6. What is deliberately not done yet

**Real sign-in in front of real data.** Until `LDAP_URL` is set the dummy
directory accepts the published passwords in
[30-credentials-and-access.md](30-credentials-and-access.md), and until Google
is configured (or `MOCK_LOGIN=false`) Mock Authentication is open. Both are
fine for the demo deployment and both must change before real bookings.

**Per-request, user-scoped database clients.** Every table has RLS on and no
`authenticated` write policy, and the policies are tested with two users in the
migration harness — but the server still reaches the database with the
service-role key from one server-only module. Making the store per-request
would mean minting Supabase JWTs and rewriting every write path to satisfy the
policies. Today the boundary is the server: every action re-checks the caller.
This is the first item of the next security phase
([04-roadmap.md](04-roadmap.md)).

**A second factor for staff other than developers.** Wardens, HODs and the
manager sign in with the institute directory and nothing more. The seam is
`stepUpProblem()`, which returns null for those roles today; that is where the
demand would be added if the institute asks for it.
