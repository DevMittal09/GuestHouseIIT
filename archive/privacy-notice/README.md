# The privacy notice - withdrawn 14 October 2026, and how to put it back

> **Read [`../README.md`](../README.md) first.** Nothing in this folder is
> compiled or deployed, and nothing in the application may import it. A restore
> is a **copy back**, never a link to here.

## What was withdrawn

The owner asked, on 14 October 2026, for the **privacy policy feature to be
removed completely**, kept in the repository so it can be reverted. It came in
two halves, the same day:

1. **The consent tick** (earlier, the guest house office): the paragraph and
   check box at the foot of the booking form, and - because a consent nobody is
   asked for must not be recorded - the two columns `createBooking` used to
   write.
2. **The notice itself** (this folder): the `/privacy` page and route, its
   version constant, and every link to it.

**What was deliberately kept, and is still live:**

| Kept | Where | Why |
| --- | --- | --- |
| **Download my data** and **Ask for erasure** | `components/my-data.tsx`, `app/actions/privacy.ts`, the foot of My Bookings | These are what a person can *do* about their data, not a document about it. The office still answers each erasure request from Console -> Security |
| The nightly **retention job** | `lib/retention-server.ts` | It erases identity numbers and uploaded ID documents `id_retention_days` after a stay and trims the audit log. It is a security control; removing it would mean keeping Aadhaar scans for ever |
| `rules.privacy` (retention Settings) | `lib/settings.ts`, Console -> Settings | Feeds the job above |
| `privacy_requests` (migration 21) | the database | Still read and written by the two actions above |
| `bookings.privacy_notice_version`, `bookings.privacy_consent_at` | the database, `lib/types.ts` | **Not dropped.** Bookings made before 14 Oct 2026 carry real values, and the data export prints them. Nothing writes either column now |

So **no migration was written, and none is needed to restore this.**

## Files in this folder

| Path | Was |
| --- | --- |
| `files/app/(site)/privacy/page.tsx` | `app/(site)/privacy/page.tsx` - the notice itself: six sections, the retention figure read from Settings, the version in the masthead |

## The complete state before the removal

Commit **`8a6ebe5`** (14 Oct 2026, "Normalized the schema") is the last commit
in which the whole feature - the notice *and* the consent tick - is present and
working. For any file below:

```bash
git show 8a6ebe5:lib/booking-schema.ts        # the version that had it
git diff 8a6ebe5 -- lib/booking-schema.ts     # what changed since
```

> **Do not `git checkout 8a6ebe5 -- <file>`.** That commit also predates the
> other four items of the office's twelfth list (the Guest House Manager
> label, the green availability figures, the past-day rule, the six-month
> booking window), several of which live in the same files. Restore by the
> steps below, or take single hunks.

---

## Restore, step by step

### 1. The page and its route

```bash
cp -r "archive/privacy-notice/files/app/(site)/privacy" "app/(site)/"
```

That is the whole route: `/privacy` answers again, with no other change.

### 2. The version constant

In `lib/security.ts`, replace the block that begins
`**\`PRIVACY_NOTICE_VERSION\` is gone with the notice**` with:

```ts
/** The privacy notice a booking consented to. Bump when the notice changes. */
export const PRIVACY_NOTICE_VERSION = "2026-09-22";
```

Bump that date if the notice's wording changed while it was out of the portal -
it is what a stored consent points at.

### 3. The three links

**`components/site/site-chrome.tsx`** - the footer's bottom line, after the
Contact link:

```tsx
            <Link href="/privacy" className="text-on-ink-muted hover:text-white">
              Privacy notice
            </Link>
```

**`app/(site)/guidelines/page.tsx`** - the closing paragraph now ends at the
office's email address and a full stop. Restore the sentence after it, and the
`import Link from "next/link";` at the top of the file, which went with it:

```tsx
            . How your details are handled is set out in the{" "}
            <Link
              href="/privacy"
              className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-[5px]"
            >
              privacy notice
            </Link>
            .
```

**`components/my-data.tsx`** - first item of the row at the foot of My
Bookings, before the "Download my data" button. Its `import Link from
"next/link";` also went:

```tsx
      <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
        Privacy notice
      </Link>
```

### 4. Only if the consent tick is wanted back as well

This is the half the guest house office asked to remove, for a reason -
`.memories/02-decisions.md`, "The privacy consent tick is gone". Restore it
only on a decision about DPDP, and restore **all four** parts together: a tick
with no text beside it, or a recorded consent nobody was shown, is worse than
neither.

**a. `components/booking-form.tsx`.** Put the field back in `FormValues`:

```ts
  /** DPDP consent (Phase 8): ticked before the request can be submitted. */
  privacy_consent: boolean;
```

in `useForm`'s `defaultValues`:

```ts
      privacy_consent: false,
```

in the payload the form sends, beside `custom: values.custom,`:

```ts
      // DPDP (Phase 8): the tick below, recorded with the notice's version.
      privacy_consent: values.privacy_consent,
```

and the block itself, where the comment about the removal now stands - above
the Cancel / Submit row:

```tsx
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border-strong bg-background px-4 py-3.5 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-vermilion-deep"
          {...register("privacy_consent")}
        />
        <span>
          I have read how these details are used, who can see them and how long they are kept, and I
          agree to the guest house holding them.{" "}
          <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-vermilion decoration-2 underline-offset-4">
            Privacy notice
          </a>
          .
          <FieldError message={err("privacy_consent")} />
        </span>
      </label>
```

**b. `lib/booking-schema.ts`.** In `bookingPayloadSchema`'s object, where the
comment about the removal now stands (just before `custom:`):

```ts
      /**
       * DPDP (Phase 8): the requester agrees to how the details on this form
       * are handled, and the booking records which version of the notice they
       * were shown. Unlike the pets notice this is a tick, because consent has
       * to be given, not merely displayed.
       */
      privacy_consent: z.boolean().refine((v) => v === true, {
        message: "Tick the box to confirm you have read how these details are used",
      }),
```

**c. `app/actions/bookings.ts`.** Restore the import:

```ts
import { PRIVACY_NOTICE_VERSION } from "@/lib/security";
```

and, in `createBooking`'s insert, replace the comment block about the removal
with the line itself:

```ts
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
```

Both stores derive `privacy_consent_at` from that field, so this one line is
what starts the consent record again. Nothing is backfilled: bookings made
while it was out stay null, which reads as "not asked".

**d. The journeys.** Ten e2e specs ticked the box before submitting. Add back,
after the last field each one fills and before it presses **Submit booking
request**:

```ts
  await page.locator('[name="privacy_consent"]').check();
```

in `e2e/helpers.ts` (`submitBooking`), `e2e/club-booking.spec.ts`,
`e2e/alumni-and-relationships.spec.ts`, `e2e/room-party.spec.ts`,
`e2e/eighth-round.spec.ts`, `e2e/fifth-round.spec.ts` (x2),
`e2e/ninth-round.spec.ts` (x2) and `e2e/official-and-dining.spec.ts` (x3).
`git diff 8a6ebe5 -- e2e/` shows each place exactly.

### 5. The tests that guarded it

In `e2e/public-site.spec.ts`, put `"/privacy"` back in the 320 px path list,
restore this test, and **delete** the "the privacy notice is not published"
test that replaced it - the two assert the opposite of each other:

```ts
test("the privacy notice is published and versioned", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByText(/Version \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your rights" })).toBeVisible();
});
```

In `tests/twelfth-round.test.ts`, the two tests under "a request is submitted
with no privacy consent at all" become wrong the moment step 4 is done; replace
them with the opposite assertion (a payload with no consent is **refused**) or
delete them with a note. The unit fixtures that used to carry
`privacy_consent: true` are listed by `git diff 8a6ebe5 -- tests/`; with the
refinement back, every payload in `tests/` that submits a booking needs it
again, or that test fails.

### 6. Finish

```bash
npm run lint && npm run typecheck && npm test
NEXT_PUBLIC_SUPABASE_URL= npm run build
pkill -f "[n]ext start"; pkill -f "[n]ext-server"; npm run test:e2e
```

Then delete this folder, remove its row from [`../README.md`](../README.md),
and update `.memories/` the way `CLAUDE.md` says - including the *Superseded*
notes in `02-decisions.md`, which currently record the removal as the current
decision.
