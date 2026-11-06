# Setup and deployment

This is the deployment-oriented guide to the IIT Palakkad Guest House Portal. It describes the implementation, runtime dependencies, configuration, database setup, and production rollout. For the full operational checklist and institute-specific data requirements, see [`.memories/04-production.md`](.memories/04-production.md). The complete environment-variable and credential inventory is in [`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md).

## 1. What runs in production

The application is a server-rendered Next.js App Router service:

```text
Browser
  -> Next.js pages / server actions / route handlers
      -> application session + role authorization
      -> DataStore
          -> PostgreSQL via pg (production)
          -> JSON mock store and local uploads (development only)
      -> queued email outbox -> SMTP
```

- `app/` contains public-site pages, signed-in portal pages, server actions, and API route handlers.
- `components/` contains the shared UI and feature components.
- `lib/` contains domain rules, validation, authorization, store adapters, mail, uploads, invoices, and integrations.
- `lib/store/types.ts` defines `DataStore`; `lib/store/mock.ts` and `lib/store/postgres.ts` implement it. `lib/store/index.ts` selects PostgresStore when `DATABASE_URL` is configured; otherwise it selects the JSON mock.
- `app/actions/` is the primary write boundary. Actions authenticate and authorize each operation before using the store. `/api/` contains OAuth, private document/PDF delivery, and scheduled mail endpoints.
- `supabase/migrations/` contains the historical Postgres migration files. `scripts/init-postgres.sql` is the consolidated schema for a fresh plain-PostgreSQL deployment. `supabase/seed.sql` is demo data for local development, not production account provisioning.

The mock store writes a local JSON file and is single-process, not concurrency-safe, and unsuitable for production. A production deployment must use PostgreSQL with `DATABASE_URL` configured. The PostgresStore connects as the database owner; uploaded documents are stored on the local filesystem (`uploads/` directory).

## 2. Runtime and package dependencies

Use the versions declared by the repository rather than installing packages globally:

| Requirement | Version / purpose |
|---|---|
| Node.js | **22 or newer** (`package.json` engines and `.nvmrc`) |
| npm | Use the npm bundled with the supported Node release |
| PostgreSQL | **14 or newer** (for `gen_random_uuid`, `btree_gist`, `tstzrange`) |
| Next.js | 16.x, App Router and server actions |
| React / React DOM | 19.x |
| TypeScript | 5.x |
| Tailwind CSS | 4.x with PostCSS |
| UI | Radix primitives, shadcn/ui, lucide-react, next-themes |
| Validation and forms | Zod 4, React Hook Form, `@hookform/resolvers` |
| Backend client | `pg` (node-postgres) |
| Mail and directory integrations | Nodemailer and `ldapts` |
| Date and document output | date-fns, jsPDF, jsPDF-AutoTable |
| Tests | Vitest and Playwright |

The exact package versions are pinned by [package.json](package.json) and [package-lock.json](package-lock.json). Use `npm install --no-audit --no-fund`, not `npm ci`: this lockfile was generated on Windows and the CI workflow uses `npm install` to resolve Linux-specific optional binaries.

Production also needs:

- A PostgreSQL 14+ server with a dedicated database.
- A Google Workspace OAuth client for institute sign-in. Google OAuth is implemented, but not configured by default.
- An SMTP account or relay if the deployment must deliver email.
- An HTTPS application origin and a scheduler for the two mail endpoints.
- Optional services: the external academic-record API, Sentry-compatible error reporting, and a ClamAV daemon for upload scanning.

## 3. Local development

```bash
npm install --no-audit --no-fund
npm run dev
```

Open `http://localhost:3000`. With no `DATABASE_URL`, data is stored in `.local-db.json`, uploads are stored in `uploads/`, and email is written to `.local-mail/`. The local sign-in button opens the mock account picker while Google is unconfigured. This is demo authentication, not an acceptable production login.

Useful checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run check:memories
```

`npm run test:e2e` expects a production build and uses a throwaway mock database. The CI workflow builds with no database configured. `NEXT_PUBLIC_*` values are embedded at build time, so build with the intended environment.

## 4. Environment configuration

Copy `.env.example` to `.env.local` for local work, or set variables in the hosting provider's secret/environment settings. Never commit `.env.local`, database connection strings, OAuth client secrets, SMTP passwords, encryption keys, or cron secrets.

### Required for a production server

`instrumentation.ts` calls `assertEnv()` at server startup. Production refuses to boot if any of these are missing or invalid:

| Variable | Requirement |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string, e.g. `postgresql://user:password@host:5432/guesthouse` |
| `APP_URL` | Canonical HTTPS origin, used for OAuth and allowed server-action origins |
| `CRON_SECRET` | At least 16 characters; authenticates scheduled endpoints |
| `ID_ENCRYPTION_KEY` | Base64-encoded 32-byte key for encrypted ID numbers and developer TOTP secrets |

Generate random values using a trusted local secret generator, for example `openssl rand -base64 32`. Save each value directly in the deployment secret manager. **Do not paste secrets into source files, logs, tickets, or this guide.**

Set `APP_BASE_URL` to the canonical public origin as well. It is used to construct absolute links in mail. `APP_URL` and `APP_BASE_URL` have different readers; setting both avoids redirects or mail links falling back to localhost.

### Sign-in is a separate production gate

The current sign-in page does **not** show the LDAP form. `LDAP_URL` only selects the LDAP directory implementation behind the retained LDAP action; it does not make LDAP a usable sign-in button. The current visible sign-in button:

- Starts Google OpenID Connect when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `APP_URL` are all validly configured.
- Otherwise opens `/mock-login`, unless `MOCK_LOGIN=false`.

Anyone who can reach `/mock-login` can select an account. Do not deploy real user or booking data with this door open. Configure and test Google OAuth before production, then confirm the account picker is unavailable. Setting `MOCK_LOGIN=false` without configuring Google leaves users with **no sign-in method**.

### Other supported variables

| Variables | Use |
|---|---|
| `MOCK_LOGIN` | Set to `false` only after a real sign-in path is working. |
| `DEV_LOGIN` | Development-only legacy persona cookie. Must not be `true` in production. |
| `ALLOW_MOCK_STORE` | Internal test escape hatch. Never set in a real deployment. |
| `ID_ENCRYPTION_KEYS_OLD` | Prior versioned encryption key(s), retained during a planned key rotation so existing encrypted values remain readable. Follow the key-rotation procedure in `.memories/04-production.md`. |
| `MAIL_USER`, `MAIL_APP_PASSWORD` or `MAIL_PASSWORD` | SMTP authentication. The Gmail app-password value may be pasted with spaces; the app strips them. |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE` | SMTP host and transport settings. Defaults are Gmail `smtp.gmail.com:465` with implicit TLS. |
| `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_REPLY_TO`, `MAIL_MESSAGE_ID_DOMAIN` | Sender, reply address, and mail threading identity. |
| `MAIL_DRY_RUN` | Logs/suppresses delivery for testing. Do not enable for live mail. |
| `MAIL_REDIRECT_ALL_TO` | Redirects all To recipients and drops CC. Set on staging/test deployments; **unset in production** or real Copy-to and approver CC recipients will not receive mail. |
| `APP_BASE_URL` | Canonical origin used in absolute mail links. |
| `LDAP_URL`, `LDAP_BASE_DN`, `LDAP_BIND_DN`, `LDAP_BIND_PASSWORD`, `LDAP_UID_ATTRIBUTE`, `LDAP_STARTTLS`, `LDAP_LINK_BY_EMAIL` | LDAP directory configuration for the retained LDAP authentication action. A URL without a base DN is an error. This integration is not exposed by the current sign-in form. |
| `ACADEMIC_DB_URL`, `ACADEMIC_DB_TOKEN` | Optional external academic-record API. If unset, imported `academic_records` and then demo records are used. |
| `SENTRY_DSN` | Optional redacted error reporting. |
| `CLAMAV_HOST`, `CLAMAV_PORT` | Optional ClamAV daemon for upload scanning. If configured but unreachable, the upload is rejected. |
| `MOCK_DB_PATH`, `E2E_DB`, `E2E_PORT` | Test/local database and port overrides; not production configuration. |

The complete source-of-truth inventory is [`.memories/05-credentials-and-security.md`](.memories/05-credentials-and-security.md). The `NEXT_PUBLIC_` prefix makes a value public; never use it for secrets.

## 5. Database setup

### Fresh database (recommended)

1. Create a PostgreSQL database:
   ```bash
   createdb guesthouse
   ```

2. Apply the consolidated schema:
   ```bash
   psql -d guesthouse -f scripts/init-postgres.sql
   ```

3. Optionally load demo data for development:
   ```bash
   psql -d guesthouse -f supabase/seed.sql
   ```
   Do **not** run `seed.sql` against production. It creates demo accounts, sample units, guest houses, rooms, and other demonstration data. Provision real accounts and operational data through the approved console/import procedures.

4. Set `DATABASE_URL` in `.env.local`:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/guesthouse
   ```

5. Verify with the migration checker:
   ```bash
   npm run check:migrations
   ```

### Migration history

The original 34 Supabase migration files are preserved in `supabase/migrations/` for reference and because `tests/rls-surface.test.ts` reads them to verify the security surface. For a fresh plain-PostgreSQL deployment, use `scripts/init-postgres.sql` instead of applying them individually - it represents the final state of all 34 migrations with Supabase-specific constructs removed.

The consolidated script includes:
- 10 enums in their final state
- 27 tables with all columns from all migrations
- 25 functions (final versions only)
- 16 triggers
- 63 indexes (including the 20 FK indexes from migration 34)
- 1 view (`booking_meals`)
- Tariff seed data

## 6. Production deployment

### Before deploying

- Confirm the institute has approved the hosting location, data processing, retention, and document-storage arrangement. The portal handles booking history and identity documents; the privacy-notice feature is currently withdrawn.
- Resolve the sign-in gates above. Ensure every permitted user has a profile row and the correct Google primary email, role, hostel, and unit. Google sign-in does not auto-create profiles.
- Back up the database. Test a restore before go-live.
- Apply the schema and verify with `npm run check:migrations`.
- Complete the office configuration: hostels, units/HODs, Faculty Advisors, wardens, official whitelist, guest houses/rooms, rates, GST/tax and bank details, contacts, and retention settings. Import academic records where approved.
- Change the default console password and configure developer TOTP. Do not leave demo accounts or the default console password enabled.
- Configure SMTP and test the outbox. Set `MAIL_REDIRECT_ALL_TO` on staging; leave it unset in production.

### Self-hosted (institute server)

1. Install Node.js 22+ and PostgreSQL 14+ on the server.
2. Clone the repository and run `npm install --no-audit --no-fund`.
3. Create the database and apply the schema:
   ```bash
   createdb guesthouse
   psql -d guesthouse -f scripts/init-postgres.sql
   ```
4. Set the environment variables. At minimum: `DATABASE_URL`, `APP_URL`, `CRON_SECRET`, `ID_ENCRYPTION_KEY`.
5. Build and start:
   ```bash
   npm run build
   npm start
   ```
6. Set up a reverse proxy (nginx/caddy) for HTTPS termination.
7. Set up a cron job for the mail endpoints:
   ```
   # 08:00 IST (02:30 UTC): digests, missed sweep, retention, then dispatch
   30 2 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/mail/cron
   # 08:30 IST (03:00 UTC): retry/drain outbox as safety net
   0 3 * * * curl -s -X POST -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/mail/dispatch
   ```
8. Use a process manager (pm2, systemd) to keep the Node process running.
9. Deploy a preview/staging instance first with `MAIL_REDIRECT_ALL_TO` set.
10. Smoke-test sign-in, a booking, an approval, room allocation, an uploaded document, invoice generation, and email delivery.

### Vercel (alternative)

1. Import the repository into Vercel and select Next.js.
2. Set the project Node.js version to 22 or newer.
3. Use the repository install command, `npm install --no-audit --no-fund`; use `npm run build` for the production build.
4. Add the environment variables for the intended environment. Use a hosted PostgreSQL provider (e.g. Neon, Supabase Postgres, Railway) and set `DATABASE_URL`.
5. Set the production origin in both `APP_URL` and `APP_BASE_URL`; configure the Google OAuth redirect URI to exactly `${APP_URL}/api/auth/google/callback`.
6. Deploy a preview first. Set `MAIL_REDIRECT_ALL_TO` on the preview and verify its generated emails are redirected.
7. Deploy production after the pre-deployment checks.

Vercel cron configuration is in [vercel.json](vercel.json):

| UTC schedule | Endpoint | Purpose |
|---|---|---|
| `30 2 * * *` | `/api/mail/cron` | 08:00 India time: missed/no-show processing, retention, digests, reminders, daily reports, then queue dispatch. |
| `0 3 * * *` | `/api/mail/dispatch` | Retry/drain the outbox as a safety net. |

Both require `CRON_SECRET`.

## 7. Data and operational notes

- **Accounts:** Google identifies a user; a pre-existing `profiles` row assigns their portal role and scope. Load/verify profiles before enabling sign-in. See [IMPORTING-USERS.md](IMPORTING-USERS.md) and [DATA-REQUEST-AND-IMPORT.md](DATA-REQUEST-AND-IMPORT.md).
- **Units and hostels:** these drive routing and authorization scope. Create them before importing profiles that reference them.
- **Academic records:** imported records are sensitive. Import only fields approved for the portal.
- **Uploads:** ID documents are private, validated by file signature, limited to 5 MB, and metadata-stripped for supported image formats. Uploaded files are stored in the `uploads/` directory on the server filesystem. ClamAV scanning is optional and disabled unless configured.
- **Encryption:** preserve `ID_ENCRYPTION_KEY` and any old keys used for rotation. Losing the required key can make encrypted identity numbers and TOTP secrets unreadable.
- **Backups:** back up the database and the `uploads/` directory. Protect both copies and perform restore drills.
- **Time:** application booking times use Asia/Kolkata independent of server timezone. Do not set `TZ` as a workaround.
- **Logs:** structured logs redact common secrets, email local-parts, and long digit strings. Keep hosting and database access restricted regardless.
- **Email:** messages are queued in `email_outbox`; `MAIL_REDIRECT_ALL_TO` replaces recipients and drops CC. It must not be set in production if actual recipients should receive Copy-to mail.

## 8. Troubleshooting

| Symptom | Check |
|---|---|
| Production refuses to start | Read the missing/invalid variable list from `assertEnv()`; check the four required production variables. |
| Sign-in shows the account picker in production | Google configuration is incomplete or invalid, and `MOCK_LOGIN` is not false. Do not treat the picker as authentication. |
| Google says account is not registered | Verify a matching profile and exact Google primary email exist. |
| Booking writes fail with missing columns/tables | Run `npm run check:migrations` against the intended project; apply `scripts/init-postgres.sql`. |
| Migration check reports no project | Configure `DATABASE_URL` in `.env.local` or the process environment. |
| Upload fails or returns an opaque network error | Confirm `next.config.ts` server-action body limit is 25 MB, each file is under 5 MB, and the optional ClamAV daemon is reachable if configured. |
| Mail is not delivered | Check `/admin/mail`, `email_outbox`, SMTP variables, `MAIL_DRY_RUN`, `MAIL_REDIRECT_ALL_TO`, and `CRON_SECRET`. |
| Document download fails | Check the `uploads/` directory permissions and file retention/deletion state. |
