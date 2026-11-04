"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  clearInstituteRecordsAction,
  deleteInstituteRecordAction,
  importInstituteRecordsAction,
  listInstituteRecordsForConsole,
  planInstituteImportAction,
} from "@/app/actions/academic";
import { SettingCard, useRunner } from "@/components/admin/settings-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FileUploadInput } from "@/components/admin/file-upload-input";
import {
  INSTITUTE_TABLE_LABELS,
  type InstituteTableKind,
} from "@/lib/institute/types";
import {
  columnLabel,
  csvColumnsFor,
  csvHeaderFor,
  describeImport,
  type InstituteImportPlan,
} from "@/lib/institute/import";
import { formatDateTime } from "@/lib/format";

const KINDS: InstituteTableKind[] = [
  "student",
  "employee",
  "office",
  "fcc",
  "hostel",
  "warden",
];

type InstituteRecord = { id: string; email: string; [key: string]: unknown };

export function AcademicRecordsManager({
  initialKind = "student",
  initialRecords,
}: {
  initialKind?: InstituteTableKind;
  initialRecords?: InstituteRecord[];
}) {
  const [kind, setKind] = useState<InstituteTableKind>(initialKind);
  const [records, setRecords] = useState<InstituteRecord[]>(initialRecords ?? []);
  const [counts, setCounts] = useState<Record<InstituteTableKind, number | null>>(() => {
    const c: Record<string, number | null> = {};
    for (const k of KINDS) c[k] = k === initialKind && initialRecords ? initialRecords.length : null;
    return c as Record<InstituteTableKind, number | null>;
  });
  const [loading, startLoading] = useTransition();

  const reload = useCallback(
    (k: InstituteTableKind) => {
      startLoading(async () => {
        const result = await listInstituteRecordsForConsole(k);
        if (result.ok) {
          setRecords(result.records);
          setCounts((prev) => ({ ...prev, [k]: result.records.length }));
        } else {
          toast.error(result.error);
        }
      });
    },
    [],
  );

  useEffect(() => {
    if (kind !== initialKind || !initialRecords) reload(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const switchKind = (k: InstituteTableKind) => {
    setKind(k);
    if (k !== kind) reload(k);
  };

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Employees &amp; Students</h2>
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
            onChange={(e) => switchKind(e.target.value as InstituteTableKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {INSTITUTE_TABLE_LABELS[k]}
                {counts[k] !== null ? ` (${counts[k]})` : ""}
              </option>
            ))}
          </NativeSelect>
        </div>
      </SettingCard>

      <ImportSection kind={kind} onImported={() => reload(kind)} />
      <StoredSection
        kind={kind}
        records={records}
        loading={loading}
        onChanged={() => reload(kind)}
      />
    </section>
  );
}

// ----------------------------------------------------------------- import

function ImportSection({
  kind,
  onImported,
}: {
  kind: InstituteTableKind;
  onImported: () => void;
}) {
  const { isPending, run } = useRunner();
  const [planning, startPlanning] = useTransition();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<InstituteImportPlan | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const header = csvHeaderFor(kind);
  const columns = csvColumnsFor(kind);

  const stale = plan !== null && plan.kind !== kind;
  const shown = stale ? null : plan;

  const preview = () =>
    startPlanning(async () => {
      const result = await planInstituteImportAction(kind, text);
      if (!result.ok) {
        toast.error(result.error);
        setPlan(null);
        return;
      }
      setPlan(result.plan);
    });

  return (
    <SettingCard
      title={`Paste ${INSTITUTE_TABLE_LABELS[kind].toLowerCase()}`}
      description="One record per line, comma, semicolon or tab separated. The first column is the key (email or ID), which is what a record is found by; everything after it is optional, and a short line simply leaves the rest off the record. Lines beginning with # are ignored. A header row is detected automatically and columns are mapped by name, so the order does not have to match; unknown columns in the header are ignored."
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
        <Label>Upload a file</Label>
        <FileUploadInput
          disabled={isPending || planning}
          onLoaded={(csv, name) => {
            setText(csv);
            setPlan(null);
            setFileName(name);
          }}
        />
        <p className="text-xs text-muted-foreground">
          CSV or Excel (.xlsx). The first sheet is read; the columns must match the order above.
        </p>
      </div>

      <div className="relative space-y-1.5">
        <Label htmlFor="academic-paste">Or paste records</Label>
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
            setFileName(null);
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
            <p className="mt-1">...and {shown.problems.length - 12} more.</p>
          )}
        </div>
      )}

      {shown && shown.problems.length === 0 && (
        <div className="border-l-4 border-border-strong bg-band/60 px-3 py-2 text-sm space-y-1">
          <p>
            <span className="font-medium">{describeImport(shown)}.</span>{" "}
            {shown.added.length + shown.updated.length === 0
              ? "Every line matches what is already stored."
              : "Import to apply it. An updated record replaces what is stored for that email."}
          </p>
          {shown.hadHeader && (
            <p className="text-xs text-muted-foreground">
              Header detected: reading {shown.columns.length} column{shown.columns.length === 1 ? "" : "s"} by name
              {shown.skippedHeaders.length > 0 && (
                <> ({shown.skippedHeaders.length} ignored: {shown.skippedHeaders.join(", ")})</>
              )}
            </p>
          )}
          {!shown.hadHeader && (
            <p className="text-xs text-muted-foreground">
              No header detected - reading columns in default order
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={planning || isPending || text.trim() === ""}
          onClick={preview}
        >
          {planning ? "Checking..." : fileName ? "Check the file" : "Check the paste"}
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
                const result = await importInstituteRecordsAction(kind, text);
                if (result.ok && result.summary) toast.message(result.summary);
                return result;
              },
              "Records imported",
              () => {
                setText("");
                setPlan(null);
                setFileName(null);
                onImported();
              },
            )
          }
        >
          Import
        </Button>
      </div>
    </SettingCard>
  );
}

function placeholderFor(kind: InstituteTableKind): string {
  if (kind === "student") {
    return "112201001@smail.iitpkd.ac.in, 2022, 112201001, Anjali Menon, B.Tech, Dr. Ravi, Computer Science and Engineering, 2022, +91 90000 00101, , Ramesh Menon, , , Sreeja Menon, , , , , , , , , Malhar";
  }
  if (kind === "employee") {
    return "priya@iitpkd.ac.in, FAC-1042, Dr. Priya Sharma, Computer Science and Engineering, Faculty, Assistant Professor, +91 90000 00201, 0491 000 1042, Female";
  }
  return csvHeaderFor(kind);
}

// ----------------------------------------------------------------- stored

function StoredSection({
  kind,
  records,
  loading,
  onChanged,
}: {
  kind: InstituteTableKind;
  records: InstituteRecord[];
  loading: boolean;
  onChanged: () => void;
}) {
  const { isPending, run } = useRunner();
  const [deleting, setDeleting] = useState<InstituteRecord | null>(null);
  const [clearing, setClearing] = useState(false);
  const columns = (csvColumnsFor(kind) as readonly string[]).slice(1);

  return (
    <SettingCard
      title={`${INSTITUTE_TABLE_LABELS[kind]} on record`}
      description="A blank cell is a gap in the record, shown as &quot;Not on record&quot; wherever the portal displays it - never filled in from somewhere else."
    >
      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-6">Loading...</p>
      ) : records.length === 0 ? (
        <p className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing imported for this kind yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-band text-left">
              <tr>
                <th scope="col" className="p-2 font-medium">
                  {columnLabel((csvColumnsFor(kind) as readonly string[])[0])}
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
              {records.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="p-2 whitespace-nowrap">{row.email}</td>
                  {columns.map((column) => (
                    <td key={column} className="p-2">
                      {(row as Record<string, unknown>)[column] as string ?? (
                        <span className="text-xs text-muted-foreground">Not on record</span>
                      )}
                    </td>
                  ))}
                  <td className="p-2 text-xs whitespace-nowrap text-muted-foreground">
                    {row.updated_at ? formatDateTime(row.updated_at as string) : "-"}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{records.length} stored</Badge>
        <span className="flex-1" />
        {records.length > 0 && (
          <Button size="sm" variant="outline" disabled={isPending} onClick={() => setClearing(true)}>
            Clear all {INSTITUTE_TABLE_LABELS[kind].toLowerCase()}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove this record?"
        description={
          deleting
            ? `The record for ${deleting.email} will be removed.`
            : ""
        }
        confirmLabel="Remove"
        pending={isPending}
        onConfirm={() =>
          deleting &&
          run(
            () => deleteInstituteRecordAction(kind, deleting.id),
            "Record removed",
            () => { setDeleting(null); onChanged(); },
          )
        }
      />

      <ConfirmDialog
        open={clearing}
        onOpenChange={(open) => !open && setClearing(false)}
        title={`Clear every ${INSTITUTE_TABLE_LABELS[kind].toLowerCase()} record?`}
        description={`All ${records.length} ${INSTITUTE_TABLE_LABELS[kind].toLowerCase()} records will be removed. You can paste them in again.`}
        confirmLabel="Clear"
        confirmPhrase="CLEAR"
        pending={isPending}
        onConfirm={() =>
          run(
            async () => {
              const result = await clearInstituteRecordsAction(kind);
              if (result.ok && result.summary) toast.message(result.summary);
              return result;
            },
            "Records cleared",
            () => { setClearing(false); onChanged(); },
          )
        }
      />
    </SettingCard>
  );
}
