import { Badge } from "@/components/ui/badge";
import {
  FAMILY_VERDICT_LABELS,
  familySummary,
  type FamilyVerdict,
  type StudentRecordPanel,
} from "@/lib/academic/family";

const VERDICT_STYLES: Record<FamilyVerdict, string> = {
  match: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  close: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  differs: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
  not_on_record: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100",
  not_on_request: "",
};

const LOOKUP_NOTES: Partial<Record<StudentRecordPanel["status"], string>> = {
  not_found: "The academic database has no record for this student — check the guests' names yourself.",
  unavailable: "The academic database could not be reached just now — check the guests' names yourself, or try again shortly.",
};

/**
 * The student's academic record beside their request, for the Assistant
 * Warden who forwards it (25 Sep 2026): the record's rows, then each Father /
 * Mother / Guardian on the request against the name on record.
 */
export function StudentRecordCheck({ panel }: { panel: StudentRecordPanel }) {
  return (
    <section className="space-y-3 rounded-lg border p-3 text-sm">
      <div>
        <p className="font-medium">Student&apos;s record — academic database</p>
        <p className="text-xs text-muted-foreground">
          Check the family on this request against the names the institute has on file before forwarding it.
        </p>
      </div>
      {LOOKUP_NOTES[panel.status] && <p className="text-muted-foreground">{LOOKUP_NOTES[panel.status]}</p>}
      {panel.rows.length > 0 && (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {panel.rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{row.label}</dt>
              <dd className="break-words">{row.value ?? <span className="text-muted-foreground">Not on record</span>}</dd>
            </div>
          ))}
        </dl>
      )}
      {panel.family.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[26rem] text-sm">
            <thead className="bg-muted/60">
              <tr>
                <th className="p-2 text-left font-medium">Relationship</th>
                <th className="p-2 text-left font-medium">On record</th>
                <th className="p-2 text-left font-medium">On this request</th>
                <th className="p-2 text-left font-medium">Check</th>
              </tr>
            </thead>
            <tbody>
              {panel.family.map((c) => (
                <tr key={c.relationship} className="border-t">
                  <td className="p-2">{c.relationship}</td>
                  <td className="p-2">{c.onRecord ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="p-2">
                    {c.onRequest.length > 0 ? c.onRequest.join(", ") : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-2">
                    <span
                      className={
                        c.verdict === "not_on_request"
                          ? "text-xs text-muted-foreground"
                          : `inline-block rounded-md border px-2 py-0.5 text-xs ${VERDICT_STYLES[c.verdict]}`
                      }
                    >
                      {FAMILY_VERDICT_LABELS[c.verdict]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {panel.sample && (
        <p className="border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Demo build — a sample record until the institute&apos;s academic database is connected.
        </p>
      )}
    </section>
  );
}

/** The queue row's one-glance summary: all names match, or something to look at. */
export function FamilyBadge({ panel }: { panel: StudentRecordPanel | undefined }) {
  if (!panel) return null;
  const summary = familySummary(panel.family);
  if (summary === "none") return null;
  return summary === "match" ? (
    <Badge variant="outline" className="ml-2 border-emerald-300 text-emerald-800 dark:text-emerald-200" title="Every parent or guardian on this request matches the academic record">
      ✓ Matches record
    </Badge>
  ) : (
    <Badge variant="outline" className="ml-2 border-amber-300 text-amber-900 dark:text-amber-200" title="A parent or guardian on this request differs from the academic record — open Review">
      ⚠ Check names
    </Badge>
  );
}
