"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteProjectAction,
  importProjects,
  previewProjectImport,
  setProjectActive,
} from "@/app/actions/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { Project, ProjectImportPlan } from "@/lib/projects";

/**
 * The projects a stay can be debited to (Phase 4). Loaded in bulk by pasting
 * from a spreadsheet — the same all-or-nothing approach as the LDAP username
 * import — and deactivated rather than deleted once a booking has used one.
 */
export function ProjectsManager({ projects }: { projects: (Project & { bookings: number })[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<ProjectImportPlan | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const preview = () =>
    startTransition(async () => {
      const result = await previewProjectImport(text);
      if (result.ok) setPlan(result.plan);
      else toast.error(result.error);
    });

  const apply = () =>
    startTransition(async () => {
      const result = await importProjects(text);
      if (result.ok) {
        toast.success(`${result.added} added, ${result.updated} updated`);
        setText("");
        setPlan(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        toast.success(success);
        after?.();
        router.refresh();
      } else {
        toast.error(result.error ?? "Something went wrong");
      }
    });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Projects</h2>
        <p className="text-sm text-muted-foreground">
          The projects a booking can be debited to when its head is <strong>Project</strong>. Only
          active projects are offered on the booking form. A project a booking has used cannot be
          deleted — deactivate it when it closes, and its bookings and invoices still name it.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <Label htmlFor="project-import">Import from a spreadsheet</Label>
        <p className="text-xs text-muted-foreground">
          Paste rows of <span className="font-mono">project number, title, principal investigator</span>{" "}
          — copied straight from Excel (tab separated) or comma separated. A number already on the
          list updates its title and PI. Any bad line and nothing is imported.
        </p>
        <Textarea
          id="project-import"
          rows={5}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPlan(null);
          }}
          placeholder={"SP/2025/017\tGrid-scale energy storage\tDr. Priya Sharma"}
          className="font-mono text-xs"
        />
        {plan && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            {plan.problems.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-5 text-destructive">
                {plan.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : (
              <p>
                {plan.added.length} to add, {plan.updated.length} to update, {plan.unchanged}{" "}
                unchanged.
              </p>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={preview} disabled={isPending || !text.trim()}>
            Preview
          </Button>
          <Button
            onClick={apply}
            disabled={isPending || !plan || plan.problems.length > 0 || plan.added.length + plan.updated.length === 0}
          >
            Import
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          No projects yet. Paste the list above.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>PI</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">
                    {p.project_number}
                    {!p.active && (
                      <Badge variant="outline" className="ml-2">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{p.title}</TableCell>
                  <TableCell>{p.pi_name ?? "—"}</TableCell>
                  <TableCell className="text-right">{p.bookings}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() =>
                        run(
                          () => setProjectActive(p.id, !p.active),
                          p.active ? `${p.project_number} deactivated` : `${p.project_number} reactivated`
                        )
                      }
                    >
                      {p.active ? "Deactivate" : "Reactivate"}
                    </Button>{" "}
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending || p.bookings > 0}
                      title={p.bookings > 0 ? "Bookings are debited to it — deactivate it instead" : undefined}
                      onClick={() => setDeleting(p)}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this project?"
        description={`${deleting?.project_number ?? ""} will be removed from the list. It has no bookings, so nothing else changes.`}
        confirmPhrase={deleting?.project_number}
        pending={isPending}
        onConfirm={() =>
          deleting &&
          run(() => deleteProjectAction(deleting.id), `${deleting.project_number} deleted`, () => setDeleting(null))
        }
      />
    </section>
  );
}
