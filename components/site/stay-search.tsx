import { ArrowRight, BedDouble, CalendarCheck2, CalendarDays } from "lucide-react";
import type { SiteGuestHouse } from "@/lib/site-data";
import { toInstituteDateValue } from "@/lib/tz";
import { cn } from "@/lib/utils";

const FIELD =
  "group relative flex min-w-0 flex-col justify-center gap-1 rounded-2xl px-5 py-3 transition-colors focus-within:bg-band hover:bg-band/70";
const LABEL =
  "flex items-center gap-1.5 text-[11px] font-bold tracking-[0.14em] text-muted-foreground uppercase";
const CONTROL =
  "w-full min-w-0 cursor-pointer appearance-none bg-transparent text-[15.5px] font-semibold text-foreground outline-none [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-50";

/**
 * The booking bar on the home page: guest house and dates, handed to
 * `/book-room` as a plain GET form. That page carries them through sign-in
 * into `/book`, which pre-fills the request (`lib/stay-query.ts`). No
 * JavaScript, and nothing is decided here — the booking form still applies
 * the role's guest houses and the advance-booking window on submit.
 */
export function StaySearch({ houses, className }: { houses: SiteGuestHouse[]; className?: string }) {
  const today = toInstituteDateValue(new Date());

  return (
    <form
      action="/book-room"
      method="get"
      aria-label="Plan your stay"
      className={cn(
        "grid gap-1 rounded-[28px] bg-white p-2 shadow-lift ring-1 ring-black/5 md:grid-cols-[1.25fr_1fr_1fr_auto] md:items-stretch",
        className
      )}
    >
      <label className={FIELD}>
        <span className={LABEL}>
          <BedDouble aria-hidden className="size-3.5 text-vermilion" />
          Guest house
        </span>
        <select name="gh" defaultValue="" className={cn(CONTROL, "select-chevron")}>
          <option value="">Any guest house</option>
          {houses.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
      <label className={cn(FIELD, "md:before:absolute md:before:inset-y-4 md:before:left-0 md:before:w-px md:before:bg-border")}>
        <span className={LABEL}>
          <CalendarDays aria-hidden className="size-3.5 text-vermilion" />
          Check-in
        </span>
        <input type="date" name="in" min={today} className={CONTROL} />
      </label>
      <label className={cn(FIELD, "md:before:absolute md:before:inset-y-4 md:before:left-0 md:before:w-px md:before:bg-border")}>
        <span className={LABEL}>
          <CalendarCheck2 aria-hidden className="size-3.5 text-vermilion" />
          Check-out
        </span>
        <input type="date" name="out" min={today} className={CONTROL} />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-[22px] bg-vermilion-deep px-7 text-[15px] font-semibold text-white shadow-glow transition-all duration-200 hover:bg-vermilion-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion active:translate-y-px"
      >
        Check &amp; book
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </form>
  );
}
