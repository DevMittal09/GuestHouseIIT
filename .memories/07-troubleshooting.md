# Traps and fixes

Problems already hit during the build, with their causes. Each cost real time.

## Uploads fail with an opaque `NetworkError`

**Symptom.** Submitting a booking with an ID document throws
`Uncaught TypeError: NetworkError when attempting to fetch resource`, pointing at
the page component rather than anything useful.

**Cause.** Next.js server actions have a **1 MB request body limit** by default.
Any real photo exceeds it; the request is dropped and the browser surfaces a
generic network failure.

**Fix.** `next.config.ts` sets
`experimental.serverActions.bodySizeLimit: "25mb"`. Per-file validation (5 MB,
JPG/PNG/WEBP/PDF) lives in `app/actions/bookings.ts`. If uploads start failing
again, check this setting first — and restart the dev server, since config
changes need a fresh process.

## "I can't select the time"

**Symptom.** The time field appears to accept typing only.

**Cause.** Firefox renders `datetime-local` and `type="time"` without a picker.

**Fix.** Use `components/ui/time-select.tsx` — hour / minute / AM-PM dropdowns,
controlled via `value` (`"HH:mm"`, 24-hour) and `onChange`. **Never reintroduce
native time inputs.** Its `parseTime` / `toTimeValue` handle the classic traps
(12 AM = `00:00`, 12 PM = `12:00`); re-test those if you touch the conversion.

## Times are 5h30m late — a 12:00 booking shows as 5:30 PM

**Fixed.** `toIso()` in `app/actions/bookings.ts` used to be
`new Date(datetimeLocal).toISOString()`. A naked "2026-09-15T12:00" is resolved
in the **process** timezone, so it was right on a developer machine set to IST
and wrong on a UTC host: 12:00 was stored as `12:00Z`, which is 5:30 PM IST.
A 10:00 check-out became 3:30 PM. It goes through `lib/tz.ts` now.

Two things to know if you see it again:

- **Rows written during that period are still wrong in the database.** The code
  fix only affects new bookings. Compare the stored time-of-day: a correctly
  stored IST wall-clock time on the hour lands on `06:30Z` / `04:30Z`, a
  UTC-parsed one keeps the typed `12:00Z` / `10:00Z`.
  `supabase/repairs/2026-09-10-utc-parsed-bookings.sql` shifts them and rebuilds
  their room holds.
- **Anything that reintroduces `new Date(<datetime string>)` or an unzoned
  formatter brings it back.** Use `instituteIso()` to parse and `lib/format.ts`
  to render. Verify by running the app's logic under `TZ=UTC` — that is the
  environment where the bug appears, and a machine in IST will not show it.

## Bookings fail to submit against Supabase with a column error

`bookings.meals` is migration 6. Apply
`supabase/migrations/00000000000006_booking_meals.sql` in the SQL editor. Reads
degrade gracefully (`normalizeMeals` fills in "none requested"), so the symptom
is writes failing while every page still renders.

## A tab suddenly shows a different user, or says "This browser switched user"

Working as intended. The mock session is a cookie, which belongs to the browser
and not to a tab, so signing in as another persona anywhere changes every tab —
and the 5 s polling used to make the others re-render as that persona in place.
`components/tab-session-guard.tsx` now blocks the mismatched tab and stops its
polling. To use two accounts at once, use a private window or a second browser
profile; genuine per-tab sessions need real authentication.

## Form Builder changes appear to do nothing

**Symptom.** You edit `buildDefaultFormConfig` and the form is unchanged.

**Cause.** A saved config row for that role takes precedence over the defaults.

**Fix.** Check `form_configs` (Supabase) or `.local-db.json` (mock). "Reset to
spec defaults" in the Form Builder deletes the row and restores defaults.

## Status facet counts collapse on Supabase but not on the mock store

**Symptom.** The tiles on `/history` show the right numbers locally, but against
Supabase every tile except the selected one drops to zero the moment you click a
status.

**Cause.** `SupabaseStore.searchBookings` was pushing `criteria.statuses` down
into SQL (`.in("status", …)`). `runBookingSearch` computes per-status facet
counts *before* applying the status filter, so it needs the other statuses to
still be in the candidate set. The mock store filters everything in memory and
was unaffected — a textbook case of the two backends disagreeing.

**Fix.** Do not push `statuses` down. Guest house, requester role and the
check-in range are still filtered in SQL; the status filter is applied by the
shared matcher. The comment in `lib/store/supabase.ts` says so — leave it there.

**Lesson.** When a change touches `searchBookings`, exercise **both** stores.
The mock store can be driven directly with
`npx tsx --tsconfig ./tsconfig.json` and Supabase through the running dev server.

## An archive search misses old bookings

**Cause.** `SEARCH_SCAN_LIMIT` in `lib/store/supabase.ts` caps one search at
1000 candidate rows.

**Fix.** The result carries `truncated: true` and the UI shows an amber banner
asking for a date range or guest house filter. If this starts happening often,
that is the signal to move keyword matching into Postgres (a `tsvector` column
maintained by a trigger) rather than raising the cap.

## shadcn/ui init fails

**Cause.** The registry changed. `-b neutral` is rejected.

**Fix.** `init` needs `-b radix -p nova --no-monorepo`. There is **no `form`
component** in this registry, which is why the project uses
`components/ui/native-select.tsx` plus manual `FieldError` rendering instead of
shadcn's `Form`.

## Lint fails on React Compiler rules

The React Compiler lint is strict and these all fail `npm run lint`:

- reading refs or calling `setState` during render;
- calling react-hook-form's `watch()` in render — use `useWatch({ control, name })`;
- calling `setState` synchronously in an effect body.

The `watch()` → `useWatch` conversion was needed for the time picker fields.

## `create-next-app` rejects the directory name

**Cause.** npm package names cannot contain capitals, and the directory is
`GuestHouseIIT`.

**Workaround used.** Scaffolded in a lowercase temporary directory and moved the
files in. Do not try to re-scaffold in place.

## `.env.example` silently not committed

**Cause.** `.gitignore` contains `.env*`, which matches `.env.example` too.

**Fix.** The `!.env.example` exception on the following line must stay.

## Missing seed persona after adding one

**Cause.** `.local-db.json` already exists and is not regenerated.

**Fix.** `loadDb()` self-heals — it adds missing seeded profiles and a missing
`form_configs` key on load. If something else is stale, delete `.local-db.json`.

## Supabase queries return empty with the anon key

**Cause.** RLS policies filter rows for unauthenticated callers.

**Explanation.** Server-side code uses the service-role key and bypasses RLS.
Debugging with the anon key from curl will legitimately show `[]`. Use the
service-role key for out-of-band inspection, and see the honesty note in
[04-database.md](04-database.md#row-level-security).

## `next dev` will not start

**Cause.** Another dev server is already running (it prints the PID and port).

**Fix.** Use the existing server, or kill that PID. Do not assume port 3000 is
free.

## Type errors after touching domain shapes

`lib/types.ts` uses `type` aliases rather than `interface` on purpose, so that
Supabase's generated `Insert` / `Update` helpers accept them. Converting one to an
`interface` will produce confusing assignability errors in `lib/store/supabase.ts`.

## `npm run dev` says Node.js >= 20.9.0 required

**Cause.** The system default is Node v18.19.1 and `nvm` is not loaded in the
current terminal session.

**Fix.** Load nvm first, then run:
```bash
export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20
```
Then `npm run dev`, `npm run build`, etc. will work. Keep the terminal open;
the Node version persists for the session.

## `npx supabase` hangs or says `supabase: not found`

**Cause.** The Supabase CLI binary (`@supabase/cli-linux-x64`) is ~60 MB and
`npx` sometimes stalls downloading it, especially on slow networks. After a
`Ctrl+C` the partial install leaves no working binary.

**Fix.** Install it as a local dev dependency instead of using `npx`:
```bash
npm install -D supabase
npx supabase db push
```
Or apply migrations manually via the Supabase Dashboard SQL Editor.
