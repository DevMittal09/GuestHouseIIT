# Workflows

What each person does, and where a request goes when they do it. This is the
portal as the office works it — one section per role, then the pipelines drawn
out, then the states a booking can be in.

Everything here is enforced in `lib/workflow.ts` (routing and permissions),
`lib/units.ts` (who heads what), `lib/access.ts` (what a role may open) and
`lib/invoice.ts` (what may be billed). If this page and the code disagree, the
code is right and this page is a bug.

---

## 1. The people

| Role | Portal home | What they do |
| --- | --- | --- |
| Student | `/dashboard` | Books for family. Their Assistant Warden reviews it. |
| Employee (faculty or staff) | `/dashboard` | Books officially (HOD approves) or personally (straight to the manager). |
| Official / dignitary office | `/dashboard` | Books for the institute's guests. Chooses **Direct** or **Requires HOD approval** per booking. |
| Club / fest council | `/dashboard` | Books officially. Its Faculty Advisor or council secretary reviews, then the HOD if the club has one. |
| IAR Student Cell | `/dashboard` | Raises alumni bookings. The IAR Office reviews. |
| IAR Office | `/iar` | Reviews the Student Cell's requests, and books for its own office. |
| Assistant Warden | `/warden` | Reviews their own hostel's students' requests. |
| Faculty Advisor / council secretary | `/approvals` | Reviews their club's requests. |
| HOD (by appointment, not by role) | `/hod` | Reviews official requests from their department, its staff and its office. |
| Guest House Manager | `/manager` | Allocates rooms, approves, runs the desk, issues invoices, takes bookings for people who cannot use the portal. |
| Guest House Caretaker | `/caretaker` | Marks arrivals and departures. Sees the same stays table as the manager. |
| Developer | `/admin` | Settings, accounts, units, tariffs, forms, mail templates, audit. |

**Approval by appointment.** An HOD is whoever heads the unit *now* (Console →
Departments & Clubs), not whoever holds a particular role: a council secretary
is a student, an HOD is an employee. Change the head and the waiting requests
move with them — nothing is stamped onto the booking.

**Nobody approves their own request.** `canReview` refuses it outright, and
routing skips a stage the requester would be approving themselves.

---

## 2. The pipelines

### 2.1 A student's stay

```mermaid
flowchart LR
  A[Student submits] --> W[Pending Assistant Warden Review]
  W -->|Forward| M[Pending GH Manager]
  W -->|Reject + reason| R[Rejected]
  M -->|Allocate rooms| AP[Approved]
  M -->|Reject + reason| R
  AP -->|Guest arrives| O[Occupied]
  O -->|Guest leaves| V[Vacated]
  V -->|Invoice issued, then paid| PAID([Settled])
```

The warden is scoped to their own hostel: `warden.hostel_name` must match the
student's.

### 2.2 An employee's stay

```mermaid
flowchart LR
  E[Employee submits] --> Q{Official or personal?}
  Q -->|Personal — their own money| M[Pending GH Manager]
  Q -->|Official| H{Does the department have an HOD?}
  H -->|Yes| HOD[Pending HOD Approval]
  H -->|No — stage skipped, said so in the log| M
  HOD -->|Forward| M
  HOD -->|Reject + reason| R[Rejected]
  M -->|Allocate rooms| AP[Approved]
```

Faculty and non-teaching staff take the same route; the debitable heads on
offer differ (`lib/debit-heads.ts`).

### 2.3 An office's stay (Director's Office, a department office, the IAR Office)

```mermaid
flowchart LR
  O[Office submits] --> C{Approval chosen on the form}
  C -->|Direct| M[Pending GH Manager]
  C -->|Requires HOD approval| HOD[Pending HOD Approval]
  HOD -->|Forward| M
  M -->|Allocate rooms| AP[Approved]
```

The choice is stored on the booking (`office_approval`), so the route cannot
change under a waiting request. An officer office (`office_class = 'officer'`)
is debited to the Institute Grant; a department office to the Department.

### 2.4 A club's stay

```mermaid
flowchart LR
  C[Club submits] --> FA[Pending Club Approval<br/>Faculty Advisor or council secretary]
  FA -->|Forward| H{Club's unit has an HOD?}
  H -->|Yes| HOD[Pending HOD Approval]
  H -->|No| M[Pending GH Manager]
  HOD -->|Forward| M
  M -->|Allocate rooms| AP[Approved]
```

### 2.5 An alumnus's stay

```mermaid
flowchart LR
  S[IAR Student Cell submits<br/>alumnus name, roll number, ID card] --> I[Pending IAR Cell Review]
  I -->|Forward| M[Pending GH Manager]
  I -->|Reject + reason| R[Rejected]
  M -->|Allocate rooms| AP[Approved]
```

Alumni have no institute login, so nobody books as one: the IAR Office or the
Student Cell raises it for them.

### 2.6 Dining (meals only, no room)

```mermaid
flowchart LR
  D[Requester picks Meal / Dining booking] --> M[Pending GH Manager]
  M -->|Confirm the kitchen can serve it| AP[Approved]
  AP --> K[On the kitchen's day sheet<br/>/manager/meals]
  K -->|From the day of the first meal| INV[Invoice]
```

Lunch for a visitor is the kitchen's business; the approval stages exist to
vouch for an overnight stay, so a meals-only booking skips them all. No room is
held, nobody is checked in, and the bill may be issued from the day of the
first meal.

### 2.7 The desk, once a stay is approved

```mermaid
flowchart TD
  AP[Approved — rooms held] -->|Guest arrives| O[Occupied]
  AP -->|Nobody arrives; automatic release after the no-show window| CAN[Cancelled — rooms freed]
  AP -->|Requester asks to cancel| CR[Cancellation Requested]
  CR -->|Manager agrees| CA[Cancellation Approved — rooms freed]
  O -->|Guest leaves| V[Vacated — rooms freed]
  O -->|Extension asked for and granted| O
  V --> B[Checked out — to bill]
  B -->|Issue & print| ISS[Invoice issued — numbered and frozen]
  ISS -->|Payment recorded| PAID[Paid]
  ISS -->|Cancel with a reason| CANC[Cancelled invoice — a corrected one may be issued]
```

A room is held exactly while the booking is in a room-holding status, so
check-out, cancellation and the no-show release all free the room with no
separate step. What the room *was* is kept on the booking's room cards, because
that is what the invoice is priced from.

---

## 3. The states

| Status | Meaning | Who moves it on |
| --- | --- | --- |
| `PENDING_WARDEN` | With the student's Assistant Warden | Warden |
| `PENDING_FA` | With the club's advisor or council secretary | That person |
| `PENDING_HOD` | With the department's head | HOD |
| `PENDING_IAR` | With the IAR Office | IAR Office |
| `PENDING_GH_MANAGER` | Waiting for rooms | Manager |
| `APPROVED` | Rooms held, guest not yet in | Desk |
| `OCCUPIED` | Guest in the building | Desk |
| `VACATED` | Guest gone, room free | Manager (the bill) |
| `CANCELLATION_REQUESTED` | Requester asked to cancel | Manager |
| `CANCELLATION_APPROVED` | Cancelled at the requester's ask | — |
| `REJECTED` | Refused, with a reason the requester sees | — |
| `CANCELLED` | Cancelled by the office, or released as a no-show | — |

A stay is only ever shown as Occupied once it has actually started
(`displayStatus`): a guest admitted early reads as Approved with the arrival in
the log, because a badge saying "Occupied" on a booking for next week is a lie
the desk has to argue with.

---

## 4. What happens automatically

| When | What | Where |
| --- | --- | --- |
| Every submission and decision | Mail to the actioner, copy to everyone who has signed it off so far | `lib/mail/notify.ts` |
| Every night | No-show release, ID-number erasure past the retention window, audit trimming | `/api/mail/cron` (Vercel Cron) |
| Every few minutes | The mail outbox is dispatched | `/api/mail/dispatch` |
| Any change to bookings, holds, blocks or invoices | Open desk screens re-fetch | `components/live-updates.tsx` |
| Any change to Settings, guest houses or rooms | The public site's cached data is expired | `lib/revalidate.ts` |

---

## 5. Where each rule actually lives

| Question | Answer in code |
| --- | --- |
| Who reviews this? | `routeFor`, `approvalStagesFor`, `canReview` (`lib/workflow.ts`) |
| Who heads this unit? | `approversOf`, `hodApproversFor` (`lib/units.ts`) |
| May this role open this page? | `lib/access.ts`, and each page's own guard |
| What may be charged? | `invoiceBlocker`, `buildInvoiceDocument` (`lib/invoice.ts`) |
| How long may a stay be, how far ahead? | `lib/settings.ts` (`rules.booking`), applied by `lib/booking-schema.ts` |
| When may the desk check someone in? | `occupancyNotStartedError` (`lib/workflow.ts`) |
| Which rooms are free? | `room_holds` and `room_blocks` in the database, `lib/availability.ts` on top |

The public `/guidelines` page is rendered from the same modules
(`lib/site-content.ts` → `lib/site-data.ts`), so the rules the institute reads
are the rules the form applies.
