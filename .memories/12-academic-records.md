# Academic records: the details card on New Booking

Since **21 Sep 2026** the top of New Booking (`/book`) shows the signed-in
person's record from the **institute's academic database**, not only what the
portal's own profile holds. Wardens see theirs on the warden portal. Until the
academic database is connected, the records are **dummy values**.

Read this when you change the card or its fields, and when you connect the real
academic database (§4).

---

## 1. The fields, by kind of account

The list the guest house office gave on 21 Sep 2026, verbatim in substance.
Each kind is one record type in `lib/academic/types.ts`. The order below is
the display order (`academicRecordRows` in `lib/academic/fields.ts`).

| Kind (`AcademicRecordKind`) | Portal roles | Fields shown | Copy to |
| --- | --- | --- | --- |
| **Student** (`student`) | `student` | Roll Number, Name, Program, Department, Email ID, Phone Number, Father's Name, Mother's Name, *Guardian's Name* (see below), Hostel | The approver: the Assistant Warden of their hostel |
| **Faculty / Non-faculty** (`employee`) | `employee` | Employee ID, Name, Department, Employee Type, Phone Number, Email ID, Office Number | — |
| **Office** (`office`) | `official`, `iar_cell` | Department, Email ID, Phone Number | The HOD / head of the office, from the office's record |
| **Student Representative** (`student_rep`) | `club` | Type of Representative, Email ID, Phone Number, Faculty in Charge Email | The approver: the club's Faculty Advisor |
| **Alumni Office** (`alumni_office`) | `iar_student_cell` | Department, Email ID, Phone Number | — |
| **Warden / Assistant Warden** (`warden`) | `warden` | Name, Phone Number, Email, Hostel | — |

Offices include Admin, Academics, the Director's Office, the Registrar's Office,
the Student Section, EWD and IAR. The role → kind table is `KIND_FOR_ROLE` in
`lib/academic/fields.ts`. It is a `Record<Role, …>`, so a new role will not
compile until someone decides its kind.

- **The two IAR accounts are mapped from the 15 Sep meeting notes.** The notes
  say "Two roles, Office and Alumni". So the IAR Office (`iar_cell`) is an
  **Office** and the IAR Student Cell account (`alumnicell@`) is the
  **Alumni Office**. If the office meant something else, change the two lines
  in `KIND_FOR_ROLE`.
- **No kind** (the card shows the portal profile, as before): `faculty_advisor`,
  `gh_manager` (booking at the desk), `gh_caretaker`, `developer`, and the
  retired `alumni`.
- **The guardian rule.** Guardian's Name replaces the two parent rows **only
  when the database has neither parent's name**. If only one parent is
  missing, both parent rows stay and the missing one reads "Not on record".
  Rahul's dummy record exercises this.
- **Office Number.** It is unconfirmed whether this means an office landline or
  a room. The label is kept as given, and the dummy value is a landline.

## 2. How it works

```
/book page (server)                          /warden page (server)
  └─ <AcademicDetailsCard user title="Requester details">   ← components/academic-details.tsx
       <Suspense fallback={Pending}>          streams in; the form below never waits for it
         academicDetailsFor(user)             lib/academic/details.ts
           ├─ academicRecordFor(user)         lib/academic/index.ts — cached, never throws
           │    └─ getAcademicSource().find(kind, email)
           │          ACADEMIC_DB_URL set → HttpAcademicSource   (lib/academic/http-source.ts)
           │          otherwise           → MockAcademicSource   (lib/academic/mock-source.ts)
           ├─ rows: academicRecordRows(record)  or  profileRows(profile)   (lib/academic/fields.ts)
           └─ copyTo: copyToFor(user, formRouteFor(user))       lib/academic/copy-to.ts
                COPY_TO_RULE[kind] is a list:
                "approver"           → every profile canReview() lets act on ANY stage of
                                       the request's chain (approvalStagesFor, lib/workflow.ts)
                "head_of_department" → the office unit's head in Departments & Clubs
                                       (or the unit above it), else record.head_name / head_email

Staff mail about a booking: CC = copyToFor(booking.requester, booking)   (lib/mail/recipients.ts
copyToAddresses → lib/mail/addressing.ts addressStaffMail removes anyone in To)
```

The same seam as `getStore()`, `getMailer()` and `getDirectory()`: **one
interface (`AcademicSource`, a single `find(kind, email)`) and two
implementations, picked from the environment.**

Rules worth keeping:

- **Records are looked up by institute email.** Every profile and every
  academic record carries one. The roll number (students only) and the
  employee id (staff only) do not cover all six kinds. Emails are lowercased
  and trimmed before the lookup.
- **The lookup never throws.** `academicRecordFor` returns a status:
  `found`, `not_found`, `unavailable` or `not_applicable`. On anything except
  `found`, the card shows the portal profile's fields and says why. A
  database outage must never stop anyone from booking. Failures are logged
  with the kind only, never the email.
- **Answers are cached in-process.** Records and "no record" are kept for
  10 minutes, an outage for 1 minute. An open `/book` re-renders whenever the
  desk's data changes (`components/live-updates.tsx`), so without the cache the
  form would ask the academic database again on every one. Consequence: **a
  correction in the academic database takes up to 10 minutes to show**, or
  restart the server.
- **The card streams behind Suspense.** The HTTP source times out after 3 s,
  and only the card waits for it.
- **Copy-to approvers come from `canReview()` on the portal profile, never
  from the academic record.** The card must name the person the request will
  actually reach. The warden and the FA are found by the same rule that routes
  the request and that mail uses (`copyToFor` in `lib/academic/copy-to.ts`,
  over `approvalStagesFor` + `canReview`). So if the academic record says hostel X but the
  profile says Y, the card shows X under Hostel, and the Y warden under
  Copy to, because the Y warden is who approves. If nobody is set up to
  approve, the card says so ("No Assistant Warden is set up on the portal for
  Brindavani yet").
- **Copy to is CC (Phase 2, owner's decision).** The same list the card shows
  is CC on every staff mail about the booking — submission, forwarding,
  allocation, cancellation — while **To is whoever must act next**. Anyone in
  To is removed from CC, and addresses are de-duplicated. The card uses the
  role's default booking type; the mail uses the booking's own, so an
  employee's *personal* booking copies nobody. Rules by kind: student,
  student rep, employee and alumni office → the approvers of the chain;
  office → the approvers (if its route has any) plus its head. The record
  itself is still never mailed.
- **A second "Copy to" exists since 24 Sep 2026, and it is not this one.** On
  New Booking the requester may type extra addresses (`bookings.copy_to_emails`)
  that are CC'd on the *requester's* mail. The card's list is the approval
  chain on *staff* mail. Different people, different mail — keep them apart.
- **On a club's form filled in by its faculty in-charge** the card shows the
  club's record ("Club details"), and its Copy-to line leaves out the Faculty
  Advisor stage the booking will skip (`formRouteFor(club, raisedBy)`).
- **The card is outside the `<form>`** on `/book`. It is read-only and
  submits nothing, and nothing from the record is stored on the booking.
- **Personal data.** The student record holds parents' names and a phone
  number. It is shown only to the person it describes, is never stored or
  logged by the portal, and never goes into mail. Keep it that way. The DPDP
  notes in [09-production-plan.md](09-production-plan.md) apply.
- **A dashed "Demo build" note** appears under the card while a dummy record
  is shown (`isMockAcademicSource()`), as the sign-in page does for the dummy
  LDAP accounts.

## 3. The dummy records

In `lib/academic/mock-source.ts`, matched by email to the seeded personas.
**Keep that file and this table in step.** Every value is invented. Phones are
in the obviously fake `+91 90000 …` range.

| Persona (email) | Kind | Highlights |
| --- | --- | --- |
| Anjali Menon (`112201001@smail…`) | Student | B.Tech, CSE, Malhar, father Ramesh Menon, mother Sreeja Menon |
| Rahul Nair (`142202014@smail…`) | Student | M.Tech, EE, Saveri, **no parents on record → guardian Gopinath Nair** |
| Dr. Priya Sharma (`priya@`) | Faculty / Non-faculty | FAC-1042, "Faculty — Assistant Professor", office 0491 000 1042 |
| Director's Office (`admin@`) | Office | Copy to: Director `director@iitpkd.ac.in` |
| IAR Office (`iar@`) | Office | Copy to: Dean, International & Alumni Relations `dean.iar@iitpkd.ac.in` |
| Petrichor (`petrichor@`) | Student Representative | "Fest Council — Petrichor", faculty in charge `fa.petrichor@` |
| IAR Student Cell (`alumnicell@`) | Alumni Office | "International & Alumni Relations — Alumni Cell" |
| Dr. Suresh Kumar (`warden.malhar@`) | Warden | Malhar |
| Dr. Lakshmi Devi (`warden.saveri@`) | Warden | Saveri |

A persona with a kind but no dummy record (for example, a user created in the
console) shows "no … record for <email>" and falls back to the profile. That is
also exactly what happens with the real database for someone it does not know.

## 4. Connecting the real academic database

**Nothing in the pages or components changes.** Only the source does.

### Option A: an HTTP API (built; env only)

1. **Get the institute to expose a read-only lookup** that follows this
   contract. It can be a thin wrapper in front of the ERP.

   ```
   GET {ACADEMIC_DB_URL}/records/{kind}?email={institute email, lowercased}
   Authorization: Bearer {ACADEMIC_DB_TOKEN}          (sent only if set)
   Accept: application/json

   200 → one JSON object with that kind's fields
   404 → no such record
   anything else, a 3 s timeout, or a body that is not a JSON object → "unavailable"
   ```

   `{kind}` is one of `student`, `employee`, `office`, `student_rep`,
   `alumni_office`, `warden`. The field names are the snake_case keys in
   `lib/academic/types.ts`, listed per kind in `ACADEMIC_RECORD_FIELDS`:

   ```jsonc
   // GET …/records/student?email=142301026@smail.iitpkd.ac.in
   {
     "roll_number": "142301026", "name": "…", "program": "B.Tech",
     "department": "…", "email": "142301026@smail.iitpkd.ac.in",
     "phone": "…", "father_name": "…", "mother_name": "…",
     "guardian_name": null, "hostel": "Malhar"
   }
   // employee: employee_id, name, department, employee_type, phone, email, office_number
   // office:   department, email, phone, head_name, head_email
   // student_rep: representative_type, email, phone, faculty_in_charge_email
   // alumni_office: department, email, phone
   // warden:   name, phone, email, hostel
   ```

   Unknown keys are ignored, and nothing else in the response is ever shown. A
   missing, blank or non-text field becomes "Not on record". Numbers are
   accepted as text, so a numeric roll number is fine.

2. **Set the environment** (`.env.local` or the host's settings; documented in
   `.env.example`):

   ```
   ACADEMIC_DB_URL=https://<erp host>/api/guesthouse/     # trailing slash optional
   ACADEMIC_DB_TOKEN=<read-only token>                     # optional, server-only
   ```

   **Setting `ACADEMIC_DB_URL` turns the dummy records off entirely** and hides
   the "Demo build" note. Restart the server. These are not `NEXT_PUBLIC_`, so
   no rebuild is needed.

3. **Check hostel names match the portal's.** Wardens are scoped by
   `profiles.hostel_name`, compared as exact text (`canReview`). If the
   academic database says "Malhar Hostel" and the portal says "Malhar", the
   card shows the first under Hostel, and routing still follows the profile.
   Either align the names, or map them in `recordFromJson`.

### If their API has a different shape

Change **`recordFromJson`** in `lib/academic/http-source.ts`, and nothing else
if only field names differ. It is the one place the database's names meet
ours. For example, `"fatherName"` becomes `father_name`, or nested
`{ parents: { father } }` is flattened there. If the URL layout differs (for
example `/students/{roll}`), change the `new URL(…)` line in
`HttpAcademicSource.find`. The roll number can be derived from a student email
(the local part), as [09-production-plan.md](09-production-plan.md) shows.

### Option B: some other transport (direct SQL, a nightly CSV, a synced table)

Write another class that implements `AcademicSource`, and choose it in
`getAcademicSource()` (`lib/academic/index.ts`):

```ts
export class SqlAcademicSource implements AcademicSource {
  readonly description = "academic database (SQL)";
  async find(kind: AcademicRecordKind, email: string): Promise<AcademicRecord | null> {
    // query by email; map the row to the kind's fields; null when no row;
    // throw AcademicSourceUnavailableError when the database cannot answer
  }
}
```

The class must: return `null` for no record, throw
`AcademicSourceUnavailableError` for an outage (the caller turns it into a
fallback), and fill every field of the kind with `string | null`.
`recordFromJson(kind, row)` does that mapping for any plain object whose keys
already match. A new driver (`pg`, `mysql2`…) is a new dependency, and
probably needs `serverExternalPackages` in `next.config.ts` like `nodemailer`.

If the institute will only hand over a periodic export, a table in Supabase
(plus an import in the developer console) is the likely shape. That means a
migration and store methods in **both** stores, per the usual rule.

### Verifying the switch

This is what was done on 21 Sep 2026, and it is quick to repeat:

1. Run a fake API on the contract above (a 30-line `node:http` server that
   answers 200 for one email, 500 for another and 404 for the rest).
2. Start the dev server on the mock store with the env pointed at it:
   `NEXT_PUBLIC_SUPABASE_URL= ACADEMIC_DB_URL=http://127.0.0.1:4545/api ACADEMIC_DB_TOKEN=… npm run dev`.
3. With `DEV_LOGIN=true` (development only),
   `curl -b "gh_mock_user=student-anjali" localhost:3000/book` and check that
   the card shows the served values, that blanks read "Not on record", that
   unknown keys do not appear, and that there is no Demo note. The 500 persona
   shows "could not be reached", with the form still rendered below. The 404
   persona shows "no Student record" with Copy to still resolved. A second
   load is served from the cache (the fake API's log does not grow).

### Questions for the academic office / IT

- Is there an API, or only database access or exports? Who issues a
  read-only token?
- Is the institute email the key on every kind of record (students, staff,
  offices, club mailboxes, the alumni cell, wardens)?
- The exact hostel names, and whether they match the portal's.
- What "Office Number" means (a landline or a room), and what "Employee Type"
  contains.
- Who the "head" of each office is in their data (the HOD, the Registrar, the
  Director…), and whether they have email addresses on record.
- How current the data is: are hostel changes at the start of a semester
  reflected immediately?

## 5. Not built (deliberately), and what to do next

- ~~Copy to is not mailed~~ — **built in Phase 2**: Copy to is CC on staff
  mail (§2). An office's head is CC'd on every staff mail about its bookings;
  whether the head also *approves* is the office's per-booking choice
  ("Requires HOD approval", Phase 4).
- **Nothing from the record is stored on the booking.** Reviewers do not see
  the requester's phone or parents. If they need to, snapshot the rows onto
  the booking at submission (as `custom_fields` snapshots its labels), so a
  later edit in the academic database does not rewrite history.
- **The profile is not synced from the record.** Routing still uses
  `profiles.hostel_name` and `department_or_club`, set by the developer
  console. Once the real database is trusted, filling those from the record
  at sign-in (just-in-time provisioning, see
  [09-production-plan.md](09-production-plan.md)) removes the hand-typed
  hostel that the warden scoping depends on.

## 6. What was verified (21 Sep 2026)

- **Throwaway `tsx` test, 23 cases:**
  - role → kind for every role
  - the field order for each kind
  - the guardian rule (both parents missing, one missing, all three missing)
  - every seeded persona with a kind has a dummy record
  - the `recordFromJson` adapter (unknown keys, blanks, numbers, non-objects)
  - the HTTP source against a local server: path, query, bearer token,
    trailing slash, 404, 500, non-JSON, a malformed URL, and the 3 s timeout
  - `academicRecordFor` returns "unavailable" instead of throwing, caches it,
    and does not log the email
  - Copy to for every persona, a hostel with no warden, and an office with no
    record
- **HTTP smoke test on the mock store:** every requester persona's `/book`,
  the manager's `/book` (profile fallback, no Copy to), and `/warden`.
- **Full stack against a fake API** (§4, "Verifying the switch").
- `npm run lint` and `npm run build` are clean.

The scripts are not in the repo. Re-create them from this list if you touch
`lib/academic/`.
