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

## "Check-out must be after check-in" on times that clearly are

The AM/PM dropdown in `components/ui/time-select.tsx` keeps whatever it already
held when only the hour is changed, and the booking form's two time fields
default to **opposite periods**: check-in `12:00` displays as PM, check-out
`10:00` as AM. So a requester who wants 9 AM → 10 PM and changes only the two
hour dropdowns actually submits **9 PM → 10 AM**, which really is out of order.
The old message stated the rule back at them and named neither time, so there
was nothing to act on.

Fixed on 10 Sep 2026 by making the interpretation visible rather than by
loosening validation:

- `TimeSelect` prints the resolved time under the dropdowns ("Check-in: 9:00 PM").
- The booking form shows a live **Your stay** panel with both resolved instants,
  the duration, and the error inline — so it is caught while filling the form.
- `checkOutOrderError()` (`lib/booking-schema.ts`) is the shared message used by
  both the schema and that panel. It names both times and, when they fall on the
  same day, says the AM/PM dropdowns do not change on their own.

If this is reported again, first ask what the read-back line says — it is the
fastest way to tell a mis-set period from a genuine date mistake.

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

The booking insert names columns that migrations add: `bookings.meals`
(migration 6) and `bookings.has_infant` (migration 7) — and until migration 8
runs, migration 6's check constraint refuses the per-day meal plan the form now
sends. Apply whichever of
`supabase/migrations/00000000000006_booking_meals.sql`,
`00000000000007_booking_infant_flag.sql` and `00000000000008_meal_plans.sql` is
missing, in order, in the SQL editor. Reads degrade gracefully (`normalizeMeals` fills in "none requested",
and a missing `has_infant` is derived from infant guest rows), so the symptom is
writes failing while every page still renders. The requester only sees
"Something went wrong while submitting the booking"; the server log carries the
PostgREST error naming the missing column.

## Every booking is rejected with "Invalid input: expected string, received null"

Reported 16 Sep 2026: submitting the booking form failed with that message and
nothing highlighted. It affected **every requester role**, not just the student
it was reported on — no booking could be submitted at all.

**Cause: the schema could not accept its own output.** The form validates on
the client and then sends `parsed.data` — the schema's *output* — over the wire
(`components/booking-form.tsx`), and `createBooking` re-parses it with the same
`bookingPayloadSchema`. `optionalTrimmed` was:

```ts
z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null))
```

Its input rejects `null`; its output *is* `string | null`. So the first pass
turned a blank `alumni_name` into `null`, `JSON.stringify` kept that key (it
drops `undefined`, not `null`), and the second pass rejected it with zod's
default invalid-type message.

It was invisible from the form because the failing paths were `alumni_name`
and `alumni_roll_number` — fields a student's form never renders — so
`setError` had no visible field to attach to and the requester saw only the
toast.

**Fix:** `.nullish()` instead of `.optional()`, so the transform's output is
also a valid input. `countField` and the guest `age` field were already
round-trip safe this way, which is the pattern to follow.

**If you touch this schema, check the round trip** — parse a realistic payload,
`JSON.parse(JSON.stringify(...))` the result, and parse it again. A throwaway
suite doing exactly that for all six requester roles, plus checks that
accepting null did not weaken the alumni / ID-number / parent-dependency
requirements, is the regression guard.

## The app feels slow when you click a button

Reported 17 Sep 2026. Measured before changing anything, because the guess on
offer ("can we use multithreading?") was the wrong lever: Node already serves
requests concurrently, and the time here is spent *waiting* on compilation and
network round trips, not on CPU work a second core could split. The pages
already issue their independent queries together (`Promise.all` in `/manager`
and `/caretaker`), and `SupabaseStore.hydrate` batches room holds into one
query, so there is no N+1 to find.

Four real causes, in order of size. All measured with 5 bookings / 36 rooms, so
none of this is data volume:

**1. `next dev` is ~7× slower than a production build.** Same data, warm:

| Route | `next dev` | `next start` |
| --- | --- | --- |
| `/dashboard` | 175 ms | 21 ms |
| `/warden` | 159 ms | 24 ms |
| `/manager` | 178 ms | 27 ms |
| `/history` | 209 ms | 25 ms |

A route's *first* hit costs more again (`/dashboard` 376 ms cold vs 94 ms
warm) because dev compiles on demand. Never judge speed from `next dev`.

**2. Against hosted Supabase every query is an internet round trip.** One
trivial `select id from guest_houses limit 1` from the dev machine:

```
270ms · 269ms · 294ms · 569ms   (first sample 1.3s)
ttfb = 578ms of a 578ms total — pure latency, not query time
```

A render is several queries plus `getCurrentUser()`, so a navigation costs
0.5–1.5 s before any of the app's own work. `.env.local` points at the hosted
project, so a plain `npm run dev` pays this on every click. Develop against the
mock store (`NEXT_PUBLIC_SUPABASE_URL= npm run dev`) or a local Supabase.

**3. Every action invalidates the whole app.** All 11 call sites in
`app/actions/bookings.ts` and `app/actions/admin.ts` use
`revalidatePath("/", "layout")`, so approving one booking re-renders every
route and re-runs the layout's queries before the button's spinner clears.
Narrowing this to the routes an action actually changes is the main code-level
win — but narrowing it too far means another tab stops noticing the change,
which is what the 5 s poll is currently covering for.

**4. The 5 s poll re-renders the whole tree, per open tab**
(`components/auto-refresh.tsx`), competing with whatever was just clicked.
`/history`, `/availability` and `/admin/mail` are already excluded.

**Not the cause:** the email layer. `after()` runs its dispatch *after* the
response is sent, so queuing and sending never delay a click.

## The Meals card is missing from the booking form

Meals are offered only where `guest_houses.serves_meals` is on — check the guest
house under Developer Console → Guest Houses & Rooms ("Serves meals"). Three
other causes, all expected:

- the role's allowed guest houses all have it off (students are Bageshri-only by
  default), so the card is not rendered at all;
- on Supabase before migration 8 the column does not exist and every guest house
  reads as serving no meals;
- the table itself appears only once a guest house that serves meals and a valid
  check-in / check-out are chosen — until then the card explains what is
  missing.

A meal showing a dash instead of a checkbox is served before check-in or after
check-out (hover for which); that is `stayMealDays` working, not a bug.

## A tab suddenly shows a different user

Expected, and not fixable in the UI. The mock session is a cookie, which belongs
to the browser and not to a tab, so signing in as another persona anywhere
changes every tab — and the 5 s polling makes the others re-render as that
persona within seconds. To use two accounts at once, use a private window or a
second browser profile.

A `TabSessionGuard` that detected the mismatch and blocked the affected tab was
built and then **reverted**: the blocking overlay was intrusive and it added
work to every page load for a demo-only concern. Don't rebuild it — see
[06-decisions.md](06-decisions.md). Genuine per-tab sessions need real
authentication.

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

## `next build` fails: "Cannot find module '../../../app/page.js'" in `.next/dev/types`

**Cause.** After moving or deleting a route (19 Sep 2026: `app/page.tsx` and
`app/mock-login/` moved into `app/(site)/`), `.next/dev/types/validator.ts` —
written by an earlier `next dev` — still imports the old paths. `next build`
type-checks it but does not regenerate the dev copy.

**Fix.** `rm -rf .next/dev/types` and build again; `next dev` recreates it. It
is generated output, nothing is lost.

## A production build on the mock store redirects every persona to `/sign-in`

**Cause.** `NEXT_PUBLIC_SUPABASE_URL` is inlined at **build** time. A build
made with `.env.local` in force has the hosted URL compiled in, so
`NEXT_PUBLIC_SUPABASE_URL= npx next start` still uses hosted Supabase, where a
mock id like `gh-manager` is not a uuid — `getCurrentUser()` returns null and
every guard redirects. (It also means the "mock" server read the shared
database.)

**Fix.** `NEXT_PUBLIC_SUPABASE_URL= npm run build` as well as for `next start`,
then rebuild normally when done. Recipe in
[05-deployment.md](05-deployment.md).

## Signed-out users land on the public home page instead of a sign-in form

**Cause.** A portal guard doing `redirect("/")`. Since 19 Sep 2026 `/` is the
public website.

**Fix.** `redirect(SIGN_IN_PATH)` from `lib/routes.ts`. `grep -rn 'redirect("/")' app`
should find nothing.

## "I can't sign in" with a personal or test address

**Cause.** `signIn()` refuses addresses outside `@iitpkd.ac.in` and its
subdomains (19 Sep 2026), with "Use your @iitpkd.ac.in email address…". A
developer-created profile on a gmail address hits this.

**Fix.** Give the profile an institute address in Users & Roles, or use
`/mock-login` for development. Do not loosen `isInstituteEmail()` — the domain
rule is the design's requirement and the server is where it is enforced.

## Resizing the camera photos gets killed (exit 137)

**Cause.** The `Images/` originals are 24-megapixel JPEGs; decoding all of them
in one Python process exhausted memory and the kernel OOM-killed it.

**Fix.** One photo per process, and `im.draft("RGB", (2000, 2000))` before
loading so the JPEG decoder works at reduced scale. Recipe in
[10-ui-design.md](10-ui-design.md#photographs).
