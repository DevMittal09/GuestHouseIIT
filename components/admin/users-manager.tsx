"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createUserAction,
  deleteUserAction,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROLE_LABELS, type Profile, type Role } from "@/lib/types";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

const EMPTY: UserFormInput = {
  email: "",
  full_name: "",
  role: "student",
  hostel_name: "",
  department_or_club: "",
  roll_number: "",
};

export function UsersManager({ profiles }: { profiles: Profile[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [values, setValues] = useState<UserFormInput>(EMPTY);

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

  const remove = (p: Profile) => {
    if (!window.confirm(`Delete ${p.full_name} (${p.email})? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteUserAction(p.id);
      if (result.ok) {
        toast.success("User deleted");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const set = (key: keyof UserFormInput) => (v: string) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {profiles.length} accounts — assign any role to any email, including additional wardens,
          advisors and developers.
        </p>
        <Button onClick={openCreate}>+ Add user</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Hostel</TableHead>
              <TableHead>Dept / Club</TableHead>
              <TableHead>Roll No.</TableHead>
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
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                      Edit
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={() => remove(p)}
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
                {ALL_ROLES.map((r) => (
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
            <div className="space-y-2">
              <Label>Roll number</Label>
              <Input
                value={values.roll_number}
                onChange={(e) => set("roll_number")(e.target.value)}
              />
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
