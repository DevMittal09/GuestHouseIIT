"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  clearAcademicRecordsAction,
  deleteAcademicRecordAction,
  importAcademicRecordsAction,
  planAcademicImportAction,
} from "@/app/actions/academic";
import { SettingCard, useRunner } from "@/components/admin/settings-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  ACADEMIC_RECORD_KIND_LABELS,
  ACADEMIC_RECORD_KINDS,
  columnLabel,
  csvColumnsFor,
  csvHeaderFor,
  describeImport,
  type AcademicImportPlan,
  type StoredAcademicRecord,
} from "@/lib/academic/stored";
import type { AcademicRecordKind } from "@/lib/academic/types";
import { formatDateTime } from "@/lib/format";

/**
 * Academic records (migration 28, 7 Oct 2026): the institute's records, kept
 * by the guest house office because the institute's own database does not
 * exist yet.
 *
 * Paste, preview, import. The preview is the point: the office is pasting
 * hundreds of rows out of a spreadsheet, and "412 added, 3 updated, 9
 * unchanged" before the fact is the difference between an import they can
 * trust and one they have to go and check. A paste with anything wrong in it
 * imports **nothing** - a half-applied list of students is worse than a
 * rejected one, because nobody can tell which half landed.
 */
export function AcademicRecordsManager({ records }: { records: StoredAcademicRecord[] }) {
  const [kind, setKind] = useState<AcademicRecordKind>("student");
  const stored = records.filter((r) => r.record.kind === kind);

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Academic records</h2>
        <p className="text-sm text-muted-foreground">
          The institute&apos;s records, as you paste them in. The Requester details card at the top
          of New Booking, the Assistant Warden&apos;s check of a student&apos;s family and the
          booking form&apos;s locked parent names all read these rows. A student with a record here
          has their father&apos;s and mother&apos;s names filled in and locked on their booking form;
          a student without one types them.
        </p>
      </div>

      <SettingCard
        title="Which records"
        description="One list per kind of account. The columns differ, so each kind is pasted separately."
      >
        <div className="max-w-sm space-y-1.5">
          <Label htmlFor="record-kind">Kind of record</Label>
          <NativeSelect
            id="record-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as AcademicRecordKind)}
          >
            {ACADEMIC_RECORD_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACADEMIC_RECORD_KIND_LABELS[k]} ({records.filter((r) => r.record.kind === k).length})
              </option>
            ))}
          </NativeSelect>
        </div>
      </SettingCard>

      <ImportSection kind={kind} />
      <StoredSection kind={kind} stored={stored} total={records.length} />
    </section>
  );
}

// ----------------------------------------------------------------- import

function ImportSection({ kind }: { kind: AcademicRecordKind }) {
  const { isPending, run } = useRunner();
  const [planning, startPlanning] = useTransition();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<AcademicImportPlan | null>(null);
  const header = csvHeaderFor(kind);
  const columns = csvColumnsFor(kind);

  // A plan is only ever shown for the text and kind it was built from.
  const stale = plan !== null && plan.kind !== kind;
  const shown = stale ? null : plan;

  const preview = () =>
    startPlanning(async () => {
      const result = await planAcademicImportAction(kind, text);
      if (!result.ok) {
        toast.error(result.error);
        setPlan(null);
        return;
      }
      setPlan(result.plan);
    });

  return (
    <SettingCard
      title={`Paste ${ACADEMIC_RECORD_KIND_LABELS[kind].toLowerCase()}`}
      description="One record per line, comma, semicolon or tab separated. The first column is the institute email, which is what a record is found by; everything after it is optional, and a short line simply leaves the rest off the record. Lines beginning with # are ignored, and so is a pasted header row."
    >
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Columns, in order</p>
        <div className="overflow-x-auto rounded-md border bg-band/40 p-2">
          <code className="text-xs whitespace-nowrap">{header}</code>
        </div>
        <ul className="grid gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
          {columns.map((column, i) => (
            <li key={column}>
              {i + 1}. {columnLabel(column)}
              {i === 0 && " - required"}
            </li>
          ))}
        </ul>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            navigator.clipboard
              ?.writeText(header)
              .then(() => toast.success("Header copied - paste it at the top of your spreadsheet"))
              .catch(() => toast.error("Could not copy - select the line above instead"));
          }}
        >
          Copy the header
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="academic-paste">Records</Label>
        <Textarea
          id="academic-paste"
          rows={8}
          spellCheck={false}
          className="font-mono text-xs"
          placeholder={placeholderFor(kind)}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPlan(null);
          }}
        />
      </div>

      {shown && shown.problems.length > 0 && (
        <div role="alert" className="border-l-4 border-vermilion bg-notice px-3 py-2 text-sm text-ink">
          <p className="font-medium">
            Nothing was imported - {shown.problems.length}{" "}
            {shown.problems.length === 1 ? "line" : "lines"} could not be read.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {shown.problems.slice(0, 12).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
          {shown.problems.length > 12 && (
            <p className="mt-1">…and {shown.problems.length - 12} more.</p>
          )}
        </div>
      )}

      {shown && shown.problems.length === 0 && (
        <p className="border-l-4 border-border-strong bg-band/60 px-3 py-2 text-sm">
          <span className="font-medium">{describeImport(shown)}.</span>{" "}
          {shown.added.length + shown.updated.length === 0
            ? "Every line matches what is already stored."
            : "Import to apply it. An updated record replaces what is stored for that email."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={planning || isPending || text.trim() === ""}
          onClick={preview}
        >
          {planning ? "Checking…" : "Check the paste"}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={
            isPending ||
            planning ||
            !shown ||
            shown.problems.length > 0 ||
            shown.added.length + shown.updated.length === 0
          }
          onClick={() =>
            run(
              async () => {
                const result = await importAcademicRecordsAction(kind, text);
                if (result.ok && result.summary) toast.message(result.summary);
                return result;
              },
              "Records imported",
              () => {
                setText("");
                setPlan(null);
              }
            )
          }
        >
          Import
        </Button>
      </div>
    </SettingCard>
  );
}

function placeholderFor(kind: AcademicRecordKind): string {
  if (kind === "student") {
    return "112201001@smail.iitpkd.ac.in, 112201001, Anjali Menon, B.Tech, Computer Science and Engineering, +91 90000 00101, Ramesh Menon, Sreeja Menon, , Malhar";
  }
  if (kind === "employee") {
    return "priya@iitpkd.ac.in, Dr. Priya Sharma, Computer Science and Engineering, +91 90000 00201, FAC-1042, Faculty - Assistant Professor, 0491 000 1042";
  }
  return csvHeaderFor(kind);
}

// ----------------------------------------------------------------- stored

function StoredSection({
  kind,
  stored,
  total,
}: {
  kind: AcademicRecordKind;
  stored: StoredAcademicRecord[];
  total: number;
}) {
  const { isPending, run } = useRunner();
  const [deleting, setDeleting] = useState<StoredAcademicRecord | null>(null);
  const [clearing, setClearing] = useState<"kind" | "all" | null>(null);
  const columns = csvColumnsFor(kind).filter((c) => c !== "email");

  return (
    <SettingCard
      title={`${ACADEMIC_RECORD_KIND_LABELS[kind]} on record`}
      description="A blank cell is a gap in the record, shown as “Not on record” wherever the portal displays it - never filled in from somewhere else."
    >
      {stored.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing imported for this kind yet. Until a student is on record, their booking form asks
          them to type their parents&apos; names.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-band text-left">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  Email
                </th>
                {columns.map((column) => (
                  <th key={column} scope="col" className="p-2 font-medium whitespace-nowrap">
                    {columnLabel(column)}
                  </th>
                ))}
                <th scope="col" className="p-2 font-medium whitespace-nowrap">
                  Imported
                </th>
                <th scope="col" className="p-2" />
              </tr>
            </thead>
            <tbody>
              {stored.map((row) => {
                const record = row.record as unknown as Record<string, string | null>;
                return (
                  <tr key={row.id} className="border-t align-top">
                    <td className="p-2 whitespace-nowrap">{row.email}</td>
                    {columns.map((column) => (
                      <td key={column} className="p-2">
                        {record[column] ?? (
                          <span className="text-xs text-muted-foreground">Not on record</span>
                        )}
                      </td>
                    ))}
                    <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                      {formatDateTime(row.updated_at)}
                    </td>
                    <td className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => setDeleting(row)}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{stored.length} stored for this kind</Badge>
        <Badge variant="outline">{total} in all</Badge>
        <span className="flex-1" />
        {stored.length > 0 && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setClearing("kind")}>
            Clear this kind
          </Button>
        )}
        {total > 0 && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setClearing("all")}>
            Clear every record
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this record?"
        description={
          deleting
            ? `The record for ${deleting.email} will be removed. Their booking form will go back to asking them to type their parents' names, and the Requester details card will show their portal profile instead.`
            : ""
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() =>
          deleting &&
          run(() => deleteAcademicRecordAction(deleting.id), "Record removed", () => setDeleting(null))
        }
      />

      {/* Clearing is how a paste that went in against the wrong kind is
          undone, so it has to be here - and it makes the operator type the
          word, like every other destructive action in the console. */}
      <ConfirmDialog
        open={clearing !== null}
        onOpenChange={(open) => !open && setClearing(null)}
        title={clearing === "all" ? "Clear every academic record?" : `Clear every ${ACADEMIC_RECORD_KIND_LABELS[kind].toLowerCase()} record?`}
        description={
          clearing === "all"
            ? `All ${total} stored records will be removed. Every booking form goes back to asking for the details, and the Requester details card falls back to the portal profile. You can paste them in again.`
            : `All ${stored.length} ${ACADEMIC_RECORD_KIND_LABELS[kind].toLowerCase()} records will be removed. You can paste them in again.`
        }
        confirmLabel="Clear"
        confirmPhrase={clearing === "all" ? "CLEAR ALL" : "CLEAR"}
        pending={isPending}
        onConfirm={() =>
          clearing &&
          run(
            async () => {
              const result = await clearAcademicRecordsAction(clearing === "all" ? undefined : kind);
              if (result.ok && result.summary) toast.message(result.summary);
              return result;
            },
            "Records cleared",
            () => setClearing(null)
          )
        }
      />
    </SettingCard>
  );
}
