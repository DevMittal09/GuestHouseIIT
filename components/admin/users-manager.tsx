"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createUserAction,
  deleteUserAction,
  importLdapUidsAction,
  updateUserAction,
  type UserFormInput,
} from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, STAFF_CATEGORY_LABELS, type Profile, type Role } from "@/lib/types";
import { UNIT_KIND_LABELS, type Unit } from "@/lib/units";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

/** Accounts this console user may not touch — see `userEditError`. */
function isLocked(actorRole: Role, target: Profile): boolean {
  return actorRole !== "developer" && target.role === "developer";
}

const EMPTY: UserFormInput = {
  email: "",
  full_name: "",
  role: "student",
  hostel_name: "",
  department_or_club: "",
  roll_number: "",
  ldap_uid: "",
  unit_id: "",
  staff_category: "",
};

export function UsersManager({
  profiles,
  units = [],
  roles = ALL_ROLES,
  actorRole = "developer",
}: {
  profiles: Profile[];
  /** Departments, clubs and offices a person can be placed in. */
  units?: Unit[];
  /** The roles this console user may hand out — see `assignableRoles`. */
  roles?: Role[];
  actorRole?: Role;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [values, setValues] = useState<UserFormInput>(EMPTY);
  const [toDelete, setToDelete] = useState<Profile | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importProblems, setImportProblems] = useState<string[]>([]);

  const openCreate = () => {
    setEditing(null);
    setValues(EMPTY);
    setDialogOpen(true);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    setValues({
      email: p.email,
      full_name: p.full_name,
      role: p.role,
      hostel_name: p.hostel_name ?? "",
      department_or_club: p.department_or_club ?? "",
      roll_number: p.roll_number ?? "",
      ldap_uid: p.ldap_uid ?? "",
      unit_id: p.unit_id ?? "",
      staff_category: p.staff_category ?? "",
    });
    setDialogOpen(true);
  };

  const save = () =>
    startTransition(async () => {
      const result = editing
        ? await updateUserAction(editing.id, values)
        : await createUserAction(values);
      if (result.ok) {
        toast.success(editing ? "User updated" : "User created");
        setDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const remove = (p: Profile) =>
    startTransition(async () => {
      const result = await deleteUserAction(p.id);
      if (result.ok) {
        toast.success("User deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const openImport = () => {
    setImportText("");
    setImportProblems([]);
    setImportOpen(true);
  };

  const runImport = () =>
    startTransition(async () => {
      const result = await importLdapUidsAction(importText);
      if (result.ok) {
        toast.success(
          `LDAP usernames set for ${result.updated} user${result.updated === 1 ? "" : "s"}` +
            (result.unchanged ? ` (${result.unchanged} already up to date)` : "")
        );
        setImportOpen(false);
        router.refresh();
      } else {
        setImportProblems(result.problems ?? []);
        toast.error(result.error);
      }
    });

  const set = (key: keyof UserFormInput) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {profiles.length} accounts — assign any role to any email, including additional wardens,
          advisors and developers.
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={openImport}>
            Import LDAP usernames
          </Button>
          <Button onClick={openCreate}>+ Add user</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl bg-card shadow-soft ring-1 ring-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Hostel</TableHead>
              <TableHead>Dept / Club</TableHead>
              <TableHead>Roll No.</TableHead>
              <TableHead>LDAP username</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.full_name}</TableCell>
                <TableCell className="text-muted-foreground">{p.email}</TableCell>
                <TableCell>
                  <Badge variant={p.role === "developer" ? "default" : "secondary"}>
                    {ROLE_LABELS[p.role]}
                  </Badge>
                </TableCell>
                <TableCell>{p.hostel_name ?? "—"}</TableCell>
                <TableCell>{p.department_or_club ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.roll_number ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{p.ldap_uid ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {/* A manager cannot edit or remove a developer account —
                        the server refuses it, and offering the button anyway
                        would only produce an error. */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLocked(actorRole, p)}
                      title={
                        isLocked(actorRole, p)
                          ? "Only a developer can change a developer account"
                          : undefined
                      }
                      onClick={() => openEdit(p)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending || isLocked(actorRole, p)}
                      onClick={() => setToDelete(p)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={toDelete ? `Delete ${toDelete.full_name}?` : ""}
        description={
          toDelete
            ? `This permanently removes the ${ROLE_LABELS[toDelete.role]} account ${toDelete.email}.`
            : ""
        }
        consequences={[
          "The person can no longer sign in to the portal.",
          "Blocked if they have any bookings — those must be deleted or reassigned first.",
          "Past approvals stay in the audit trail, which records the name separately.",
        ]}
        confirmPhrase={toDelete?.email}
        confirmLabel="Delete user"
        pending={isPending}
        onConfirm={() => {
          const p = toDelete;
          setToDelete(null);
          if (p) remove(p);
        }}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import LDAP usernames</DialogTitle>
            <DialogDescription>
              Links institute LDAP logins to existing accounts, matched by email. One{" "}
              <code className="font-mono">email, LDAP username</code> pair per line — a two-column
              spreadsheet paste works. If any line is wrong, nothing is changed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ldap-import">Email and LDAP username</Label>
            <Textarea
              id="ldap-import"
              rows={8}
              spellCheck={false}
              className="font-mono text-xs"
              placeholder={"112201001@smail.iitpkd.ac.in, 112201001\npriya@iitpkd.ac.in, priya"}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              aria-describedby={importProblems.length ? "ldap-import-problems" : undefined}
            />
            {importProblems.length > 0 && (
              <ul
                id="ldap-import-problems"
                role="alert"
                className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-sm text-destructive"
              >
                {importProblems.map((problem, i) => (
                  <li key={i}>{problem}</li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={runImport} disabled={isPending || importText.trim() === ""}>
              {isPending ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.full_name}` : "Add user"}</DialogTitle>
            <DialogDescription>
              Hostel scopes wardens/students; Dept/Club scopes faculty advisors and club accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Full name *</Label>
              <Input value={values.full_name} onChange={(e) => set("full_name")(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={values.email}
                onChange={(e) => set("email")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Role *</Label>
              <NativeSelect
                value={values.role}
                onChange={(e) => set("role")(e.target.value)}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label>Hostel</Label>
              <Input
                placeholder="e.g. Malhar"
                value={values.hostel_name}
                onChange={(e) => set("hostel_name")(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Department / Club</Label>
              <Input
                placeholder="e.g. Petrichor"
                value={values.department_or_club}
                onChange={(e) => set("department_or_club")(e.target.value)}
              />
            </div>
            {/* The unit is what their approver is found through, so it is a
                pick from the list rather than free text — a typo here used
                to mean nobody could approve their bookings. */}
            <div className="space-y-2">
              <Label htmlFor="user-unit">Belongs to</Label>
              <NativeSelect
                id="user-unit"
                value={values.unit_id ?? ""}
                onChange={(e) => set("unit_id")(e.target.value)}
              >
                <option value="">No department or club</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({UNIT_KIND_LABELS[u.kind]})
                  </option>
                ))}
              </NativeSelect>
            </div>
            {values.role === "employee" && (
              <div className="space-y-2">
                <Label htmlFor="user-staff-category">Faculty or staff</Label>
                <NativeSelect
                  id="user-staff-category"
                  value={values.staff_category ?? ""}
                  onChange={(e) => set("staff_category")(e.target.value)}
                >
                  <option value="">Not set (treated as faculty)</option>
                  <option value="faculty">{STAFF_CATEGORY_LABELS.faculty}</option>
                  <option value="staff">{STAFF_CATEGORY_LABELS.staff}</option>
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  Faculty official bookings need their HOD&apos;s approval; staff bookings go
                  straight to the Guest House Manager.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Roll number</Label>
              <Input
                value={values.roll_number}
                onChange={(e) => set("roll_number")(e.target.value)}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="user-ldap-uid">LDAP username</Label>
              <Input
                id="user-ldap-uid"
                autoCapitalize="none"
                spellCheck={false}
                className="font-mono"
                value={values.ldap_uid}
                onChange={(e) => set("ldap_uid")(e.target.value)}
                aria-describedby="user-ldap-uid-help"
              />
              <p id="user-ldap-uid-help" className="text-xs text-muted-foreground">
                The institute LDAP login this account signs in with. Leave blank and the
                person can only use Google sign-in.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : editing ? "Save changes" : "Create user"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
