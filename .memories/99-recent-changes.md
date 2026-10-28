# Recent changes - the last round, and only the last round

This file is **replaced** every round, not appended to. The round before this
one is written up where every round is: what was asked in
[01-background.md](01-background.md), why it was done that way in
[02-decisions.md](02-decisions.md).

---

## Round of 28 October 2026 (second) - the landing page, asked for a third time

**The same day as the Taramani pass, after it had shipped.** One message, four
items, and the [Taramani Guest House, IIT Madras](https://tgh.iitm.ac.in/)
named a second time: the hero type "is blending with the background too much",
and the page "overall looks very basic... make it look creative and
aesthetic".

That is the finding, not the complaint. The morning's pass took Taramani's
typography and composition and refused its decoration, and the page it
produced reads as correct and reads as basic - which are different things.
What was missing was not a shadow: the page had **nothing to read** between a
photograph and six icons, every one of its five blocks sat on a light ground,
and two of them were lists rather than compositions.

### What was asked, and what was done

| § | Asked | Done |
| --- | --- | --- |
| 1 | More opacity on the hero's overlay | `bg-ink/66` -> **`bg-ink/78`**, measured again: white display type clears **6:1** against the brightest tenth of the middle band of either photograph, near 12:1 against its average. Not pushed past ~85%, where the photograph stops reading at all |
| 2 | Keep "INDIAN INSTITUTE OF TECHNOLOGY PALAKKAD"; change the title to "GUEST HOUSE PORTAL" | The kicker is **kept verbatim** and now sits between two 40px saffron hairlines. The `<h1>` is **Guest House Portal** - title case, because the line above it is already tracked capitals. The old title said the institute's name twice and needed its separator hidden below `sm` |
| 3 | The type blends in - make it bolder | The `<h1>` is **`font-bold`**, the site's one bold heading; the lead loses `font-light`. **No drop shadow** - the answer to white type over a photograph is the wash and the weight |
| 4 | The page looks basic - make it creative and aesthetic | Four blocks, below |

### The four blocks

| Block | Change |
| --- | --- |
| **Staying on campus** | **New section.** `homeIntro(houses)` - two sentences computed from the store, naming the guest houses it holds and mentioning meals only where one has a kitchen - in five columns, with `HOME_PHOTOS.intro` in seven beside it and a **saffron corner mark** offset from its bottom left |
| Amenities | **On ink, icons in saffron**, hairlines in `white/15`. The page's one dark band between the hero and the footer. No token added: the ink is the header's and the footer's |
| A look inside | A **twelve-column mosaic** - 5x2 beside 7, then 3 and 4, then 7 and 5 - on the warm band. The spans tile the grid exactly **in that order**, so auto-placement leaves no hole |
| Our guest houses | **One ruled plate of two cells**, the name at `text-display` over a **saffron** stub. **Still text only** - the 27 Oct instruction stands, and both attributed photographs are in the hero |

Plus a **scroll cue** at the foot of the hero: an `aria-hidden`,
`pointer-events-none` chevron on `hero-cue`, the site's second keyframe. A
full viewport of photograph gives the reader no edge to say the page goes on.

**Nothing decorative was borrowed.** No shadow, no gradient, no pill, no
radius above 8px - all four banned since 30 Sep 2026. Everything above was
bought with composition, ground, type and one accent colour.
[02-decisions.md](02-decisions.md) under this date says what the next answer
would have to be if the page is still thought basic: a deliberate decision to
lift that ban, which is a change to the portal as well as the site, not four
devices smuggled onto one page.

### Files

| File | Change |
| --- | --- |
| `app/(site)/page.tsx` | The hero's kicker rules, the new `<h1>`, the opening statement, the ink amenities band, the mosaic (`MOSAIC` / `WIDE`), the guest houses as one plate (`HouseCard` -> `HouseCell`) |
| `components/site/hero-carousel.tsx` | The wash to `bg-ink/78` with the measurement; the scroll cue |
| `app/globals.css` | `@keyframes hero-cue` |
| `lib/site.ts` | `HOME_PHOTOS.intro` (`hamsanandiEntrance`) |
| `lib/site-content.ts` | `homeIntro(houses)` |
| `tests/public-site.test.ts` | Four tests for `homeIntro`, one holding the three photo sets apart, and `homeIntro` added to the no-role-names check |
| `e2e/public-site.spec.ts` | The `<h1>`, the kicker, and the opening statement's section |
| `AGENTS.md` | The home page's layout, the `<h1>` and the wash, the scroll cue, and that new home copy is computed from the store |

**No migration, no store operation, no booking rule, no permission and no
route.**

### Verified

`npm run lint`, `npx tsc --noEmit`, `npm test` (**608**, 5 new), a production
build, and the **full Playwright suite: 50/50**, including both 320px phone
passes. Section screenshots were read back at 1440px - which is what caught
the opening statement sitting in a column half its width (it had six columns
and a `max-w-[46ch]` cap inside them; it is five columns and no cap at `lg`
now).

**A trap worth knowing, hit twice here:** `pkill -f "[n]ext start"` does not
kill the server. The process renames itself **`next-server`**, so the parent
dies, the port stays held, the next `next start` fails `EADDRINUSE` in a
background log nobody reads, and the stale server goes on serving the
**previous** build out of a `.next` that has since been overwritten - which
looks exactly like "my change did nothing". Written up in
[22-running-and-testing.md](22-running-and-testing.md) Part 2.

### Left open

- **The ban on shadows, gradients, pills and 16px radii has now been tested
  twice against the same reference site.** It held both times, but it is the
  one lever left if a fourth brief says the same thing. It is a decision
  about the whole service, not about this page.
- **Nothing tests the dark amenities band** - that saffron on ink is what
  ships, or that the band does not merge with the ink footer at some width.
- **`SIGN_IN_PHOTOS` is still entirely unplaced** (from the round before).
- **`HOME_PHOTOS` now has three disjoint sets** and a unit test holding them
  apart. A fourth photograph slot on this page is one more set to keep
  disjoint by hand; there is no helper for it.
