"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { XIcon } from "lucide-react";
import { importUsersAction, previewUserImport, type UserImportSummary } from "@/app/actions/admin";
import {
  addGroupMembersAction,
  applyAccessChangeAction,
  deleteUserGroupAction,
  previewAccessChangeAction,
  removeGroupMemberAction,
  saveUserGroupAction,
} from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { isInstituteEmail } from "@/lib/site";
import { ROLE_LABELS, type Role } from "@/lib/types";
import {
  batchGroupName,
  groupCsvHeader,
  hasIntakes,
  PROGRAMME_LABELS,
  PROGRAMMES,
  type AccessAction,
  type AccessPlan,
  type Intake,
  type Programme,
  type UserGroup,
} from "@/lib/user-groups";
import { cn } from "@/lib/utils";

type GroupRow = UserGroup & { year: string | null; members: number; blocked: number };
type Member = {
  id: string;
  email: string;
  full_name: string;
  roll_number: string | null;
  blocked: boolean;
  reason: string | null;
};
type RouteRow = { label: string; route: string; rule: string; limitedToGroup: boolean };
type Person = { email: string; full_name: string };

/**
 * Console -> User Groups (5 Nov 2026): one screen for everything about a group.
 * Pick it on the left; on the right are its members, who its bookings copy, and
 * the approval path it takes. Who may sign in is underneath, because a list from
 * the academic office crosses groups.
 */
export function GroupsManager({
  groups,
  selectedId,
  members,
  routes,
  roles,
  addressBook,
  blockedTotal,
}: {
  groups: GroupRow[];
  selectedId: string | null;
  members: Member[];
  routes: RouteRow[];
  roles: Role[];
  addressBook: Person[];
  blockedTotal: number;
}) {
  const selected = groups.find((g) => g.id === selectedId) ?? null;
  const [creating, setCreating] = useState(groups.length === 0);
  // Filled by "Block everyone in this group", which uses the same reviewed flow.
  const [accessText, setAccessText] = useState("");
  const [accessAction, setAccessAction] = useState<AccessAction>("block");
  const accessCard = useRef<HTMLDivElement>(null);

  const blockWholeGroup = () => {
    setAccessAction("block");
    setAccessText(members.filter((m) => !m.blocked).map((m) => m.email).join("\n"));
    accessCard.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-12">
        <aside className="min-w-0 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold text-ink">Groups</h2>
            <Button type="button" size="sm" variant="outline" onClick={() => setCreating(true)}>
              New group
            </Button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet.</p>
          ) : (
            <ul className="divide-y divide-border border border-border-strong bg-white">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    href={`/admin/groups?group=${group.id}`}
                    aria-current={group.id === selectedId && !creating ? "page" : undefined}
                    onClick={() => setCreating(false)}
                    className={cn(
                      "block px-3 py-2.5 transition-colors hover:bg-band",
                      group.id === selectedId && !creating && "bg-ink text-white hover:bg-ink"
                    )}
                  >
                    <span className="block text-sm font-semibold">{group.name}</span>
                    <span
                      className={cn(
                        "block text-xs",
                        group.id === selectedId && !creating ? "text-white/80" : "text-muted-foreground"
                      )}
                    >
                      {[
                        ROLE_LABELS[group.role],
                        group.year,
                        `${group.members} ${group.members === 1 ? "member" : "members"}`,
                        group.blocked > 0 ? `${group.blocked} blocked` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="min-w-0 space-y-6 lg:col-span-8">
          {creating ? (
            <GroupDetails
              group={null}
              roles={roles}
              onDone={() => setCreating(false)}
              onCancel={groups.length > 0 ? () => setCreating(false) : undefined}
            />
          ) : selected ? (
            <>
              <GroupDetails group={selected} roles={roles} />
              <MembersCard group={selected} members={members} onBlockAll={blockWholeGroup} />
              <CopyToCard group={selected} addressBook={addressBook} />
              <RoutesCard routes={routes} />
            </>
          ) : null}
        </div>
      </div>

      <div ref={accessCard} className="scroll-mt-24">
        <AccessCard
          text={accessText}
          onText={setAccessText}
          action={accessAction}
          onAction={setAccessAction}
          blockedTotal={blockedTotal}
        />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- details

function GroupDetails({
  group,
  roles,
  onDone,
  onCancel,
}: {
  group: GroupRow | null;
  roles: Role[];
  onDone?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [role, setRole] = useState<Role>(group?.role ?? "student");
  const [programme, setProgramme] = useState<Programme>(group?.programme ?? "BTech");
  const [batch, setBatch] = useState(String(group?.batch_year ?? new Date().getFullYear()));
  const [intake, setIntake] = useState<Intake>(group?.intake ?? "aug");
  const [name, setName] = useState(group?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const isStudent = role === "student";

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const result = await saveUserGroupAction(group?.id ?? null, {
        name,
        role,
        programme: isStudent ? programme : null,
        batch_year: isStudent ? Number(batch) : null,
        intake: isStudent && hasIntakes(programme) ? intake : null,
        prefill_copy_to: group?.prefill_copy_to ?? [],
        allowed_copy_to: group?.allowed_copy_to ?? [],
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("Group saved");
      onDone?.();
      router.push(`/admin/groups?group=${result.id}`);
      router.refresh();
    });
  };

  const remove = () => {
    if (!group) return;
    start(async () => {
      const result = await deleteUserGroupAction(group.id);
      if (result.ok) {
        toast.success("Group deleted");
        router.push("/admin/groups");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{group ? group.name : "New group"}</CardTitle>
        <CardDescription>
          {group?.year
            ? `${group.year.startsWith("past") ? "Now" : "In their"} ${group.year}, worked out from the batch - nothing to update each July.`
            : "A student group is a programme and a batch. Anyone else is a named group."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-role">Kind of user</Label>
              <NativeSelect id="group-role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {isStudent ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="group-programme">Programme</Label>
                  <NativeSelect
                    id="group-programme"
                    value={programme}
                    onChange={(e) => setProgramme(e.target.value as Programme)}
                  >
                    {PROGRAMMES.map((p) => (
                      <option key={p} value={p}>
                        {PROGRAMME_LABELS[p]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                {hasIntakes(programme) && (
                  <div className="space-y-1.5">
                    <Label htmlFor="group-intake">Joined in</Label>
                    <NativeSelect
                      id="group-intake"
                      value={intake}
                      onChange={(e) => setIntake(e.target.value as Intake)}
                    >
                      <option value="jan">January</option>
                      <option value="aug">August</option>
                    </NativeSelect>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="group-batch">Batch (year joined)</Label>
                  <Input
                    id="group-batch"
                    type="number"
                    min={2000}
                    max={2100}
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1.5 sm:col-span-1 lg:col-span-3">
                <Label htmlFor="group-name">Name</Label>
                <Input
                  id="group-name"
                  value={name}
                  placeholder="Faculty"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
          </div>
          {isStudent && (
            <p className="text-sm text-muted-foreground">
              This group is called{" "}
              <span className="font-medium text-ink">
                {batch
                  ? batchGroupName(programme, Number(batch), hasIntakes(programme) ? intake : null)
                  : "..."}
              </span>
              .
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {group ? "Save" : "Create group"}
            </Button>
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            {group && (
              <Button type="button" variant="outline" disabled={pending} onClick={remove}>
                Delete group
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- members

function MembersCard({
  group,
  members,
  onBlockAll,
}: {
  group: GroupRow;
  members: Member[];
  onBlockAll: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<UserImportSummary | null>(null);
  const [manual, setManual] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const downloadTemplate = () => {
    const blob = new Blob([`${groupCsvHeader(group.role)}\n`], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${group.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const readFile = async (file: File | undefined) => {
    setPlan(null);
    if (!file) return;
    const text = await file.text();
    setFileName(file.name);
    setCsv(text);
    start(async () => {
      try {
        setPlan(await previewUserImport(text, group.id));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not read that file");
      }
    });
  };

  const runImport = () =>
    start(async () => {
      const result = await importUsersAction(csv, group.id);
      if (result.ok) {
        toast.success(`Imported: ${result.summary}`);
        setPlan(null);
        setCsv("");
        setFileName(null);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const addManual = () =>
    start(async () => {
      const result = await addGroupMembersAction(group.id, manual);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const p = result.plan!;
      setNotes([
        ...p.moved,
        ...p.notFound.map((who) => `${who} - no account yet. Add them with the CSV, which carries their name.`),
        ...p.refused,
      ]);
      toast.success(`${p.add.length} added`);
      setManual("");
      router.refresh();
    });

  const remove = (id: string) =>
    start(async () => {
      const result = await removeGroupMemberAction(group.id, id);
      if (result.ok) router.refresh();
      else toast.error(result.error);
    });

  const needle = search.trim().toLowerCase();
  const shown = members.filter(
    (m) =>
      !needle ||
      m.full_name.toLowerCase().includes(needle) ||
      m.email.toLowerCase().includes(needle) ||
      (m.roll_number ?? "").toLowerCase().includes(needle)
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
        <CardDescription>
          Upload the list as a CSV. Everyone on it joins this group as {ROLE_LABELS[group.role]}; anyone
          who already has an account is updated rather than duplicated.{" "}
          {group.role === "student"
            ? "Addresses are roll number@smail.iitpkd.ac.in, and the roll number column may be left empty."
            : "Addresses are name or position@iitpkd.ac.in."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            Download CSV template
          </Button>
          <Label htmlFor="group-csv" className="sr-only">
            CSV file
          </Label>
          <Input
            id="group-csv"
            type="file"
            accept=".csv,text/csv"
            className="w-auto max-w-full"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
        </div>
        <p className="font-mono text-xs break-all text-muted-foreground">{groupCsvHeader(group.role)}</p>

        {plan && (
          <div className="space-y-2 border-l-4 border-border-strong bg-band/60 p-3 text-sm">
            {plan.problems.length > 0 ? (
              <>
                <p className="font-medium text-destructive">Nothing will be imported until these are fixed:</p>
                <PlanList items={plan.problems} />
              </>
            ) : (
              <>
                <p className="font-medium text-ink">
                  {plan.added} new, {plan.updated} updated, {plan.unchanged} unchanged.
                </p>
                {plan.warnings.length > 0 && (
                  <>
                    <p className="text-ink">Worth checking:</p>
                    <PlanList items={plan.warnings} />
                  </>
                )}
                <PlanList items={plan.changes} />
                <Button
                  type="button"
                  size="sm"
                  disabled={pending || plan.added + plan.updated === 0}
                  onClick={runImport}
                >
                  Import into {group.name}
                </Button>
              </>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="group-manual">Add people who already have an account</Label>
          <Textarea
            id="group-manual"
            rows={2}
            placeholder="Roll numbers or email addresses"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="button" size="sm" variant="outline" disabled={pending || !manual.trim()} onClick={addManual}>
            Add to group
          </Button>
          {notes.length > 0 && <PlanList items={notes} />}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="group-search">
              {members.length} {members.length === 1 ? "member" : "members"}
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="group-search"
                className="w-56"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={members.every((m) => m.blocked)}
                onClick={onBlockAll}
              >
                Block everyone in this group
              </Button>
            </div>
          </div>
          {shown.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Roll No.</TableHead>
                    <TableHead>Sign-in</TableHead>
                    <TableHead className="text-right">Remove</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.slice(0, 300).map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <span className="font-medium">{m.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{m.email}</span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{m.roll_number ?? "-"}</TableCell>
                      <TableCell className={m.blocked ? "font-semibold text-vermilion-deep" : undefined}>
                        {m.blocked ? `Blocked${m.reason ? ` - ${m.reason}` : ""}` : "Allowed"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${m.email} from this group`}
                          disabled={pending}
                          onClick={() => remove(m.id)}
                        >
                          <XIcon />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {shown.length > 300 && (
            <p className="text-sm text-muted-foreground">Showing the first 300 - search to narrow the list.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------- copy to

function AddressPicker({
  id,
  label,
  help,
  addresses,
  onChange,
  addressBook,
}: {
  id: string;
  label: string;
  help: string;
  addresses: string[];
  onChange: (next: string[]) => void;
  addressBook: Person[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    // Accepts the "Name <address>" a picked suggestion carries.
    const address = (/<([^>]+)>/.exec(draft)?.[1] ?? draft).trim().toLowerCase();
    if (!address) return;
    if (!isInstituteEmail(address)) {
      setError("Use an IIT Palakkad address");
      return;
    }
    setError(null);
    if (!addresses.includes(address)) onChange([...addresses, address]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="text-sm text-muted-foreground">{help}</p>
      </div>
      {addresses.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {addresses.map((address) => (
            <li
              key={address}
              className="flex items-center gap-1 rounded border border-border-strong bg-white py-0.5 pr-0.5 pl-2 text-sm"
            >
              {address}
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-6"
                aria-label={`Remove ${address}`}
                onClick={() => onChange(addresses.filter((a) => a !== address))}
              >
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          className="max-w-sm"
          list={`${id}-book`}
          placeholder="Type a name or an address"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <datalist id={`${id}-book`}>
          {addressBook.map((p) => (
            <option key={p.email} value={`${p.full_name} <${p.email}>`} />
          ))}
        </datalist>
        <Button type="button" variant="outline" onClick={add}>
          Add
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function CopyToCard({
  group,
  addressBook,
}: {
  group: GroupRow;
  addressBook: Person[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [prefill, setPrefill] = useState(group.prefill_copy_to);
  const [allowed, setAllowed] = useState(group.allowed_copy_to);

  const save = () =>
    start(async () => {
      const result = await saveUserGroupAction(group.id, {
        name: group.name,
        role: group.role,
        programme: group.programme,
        batch_year: group.batch_year,
        intake: group.intake,
        prefill_copy_to: prefill,
        allowed_copy_to: allowed,
      });
      if (result.ok) {
        toast.success("Copy lists saved");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who their bookings copy</CardTitle>
        <CardDescription>
          The booking form&apos;s Copy to box for this group. Copied people receive every mail the
          requester gets about the booking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <AddressPicker
          id="prefill-copy-to"
          label="Filled in for them"
          help="Already in the box when they open the form. They can remove these."
          addresses={prefill}
          onChange={setPrefill}
          addressBook={addressBook}
        />
        <AddressPicker
          id="allowed-copy-to"
          label="What else they may type"
          help="Leave empty to let them copy any IIT Palakkad address. Otherwise only these, and whatever is filled in above."
          addresses={allowed}
          onChange={setAllowed}
          addressBook={addressBook}
        />
        <Button type="button" disabled={pending} onClick={save}>
          Save copy lists
        </Button>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------- routes

function RoutesCard({ routes }: { routes: RouteRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approval path</CardTitle>
        <CardDescription>
          Where this group&apos;s room requests go now. To give it a different path, add a route in{" "}
          <Link href="/admin/workflow" className="font-medium text-ink underline underline-offset-4">
            Approval Workflow
          </Link>{" "}
          and tick this group under &ldquo;Requester&apos;s group&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="space-y-3">
          {routes.map((row) => (
            <div key={row.label}>
              <dt className="text-sm font-medium text-ink">{row.label}</dt>
              <dd className="text-sm text-body">{row.route}</dd>
              <dd className="text-xs text-muted-foreground">
                {row.limitedToGroup ? "This group's own route" : "Shared route"}: {row.rule}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

// -------------------------------------------------------------------- access

function AccessCard({
  text,
  onText,
  action,
  onAction,
  blockedTotal,
}: {
  text: string;
  onText: (value: string) => void;
  action: AccessAction;
  onAction: (value: AccessAction) => void;
  blockedTotal: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reason, setReason] = useState("Graduated");
  const [plan, setPlan] = useState<AccessPlan | null>(null);

  const check = () =>
    start(async () => {
      const result = await previewAccessChangeAction(action, text);
      if (result.ok) setPlan(result.plan);
      else toast.error(result.error);
    });

  const apply = () =>
    start(async () => {
      const result = await applyAccessChangeAction(action, text, reason);
      if (result.ok) {
        toast.success(
          `${result.changed} ${result.changed === 1 ? "account" : "accounts"} ${action === "block" ? "blocked" : "restored"}`
        );
        setPlan(null);
        onText("");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    onText(await file.text());
    setPlan(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Who may sign in</CardTitle>
        <CardDescription>
          Paste or upload the roll numbers or email addresses you were sent. Nobody is deleted: their
          bookings and invoices stay, and they can be restored at any time.
          {blockedTotal > 0 && ` ${blockedTotal} ${blockedTotal === 1 ? "account is" : "accounts are"} blocked now.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="access-action">What to do</Label>
            <NativeSelect
              id="access-action"
              value={action}
              onChange={(e) => {
                onAction(e.target.value as AccessAction);
                setPlan(null);
              }}
            >
              <option value="block">Block from signing in</option>
              <option value="restore">Allow to sign in again</option>
            </NativeSelect>
          </div>
          {action === "block" && (
            <div className="space-y-1.5">
              <Label htmlFor="access-reason">Reason</Label>
              <Input id="access-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="access-list">Roll numbers or email addresses</Label>
          <Textarea
            id="access-list"
            rows={5}
            value={text}
            onChange={(e) => {
              onText(e.target.value);
              setPlan(null);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="access-file" className="sr-only">
            File with the list
          </Label>
          <Input
            id="access-file"
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="w-auto max-w-full"
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" disabled={pending || !text.trim()} onClick={check}>
            Check the list
          </Button>
        </div>

        {plan && (
          <div className="space-y-3 border-l-4 border-border-strong bg-band/60 p-3 text-sm">
            <p className="font-medium text-ink">
              {plan.targets.length} {plan.targets.length === 1 ? "account" : "accounts"} will be{" "}
              {plan.action === "block" ? "blocked" : "restored"}.
            </p>
            <PlanList items={plan.targets.map((t) => `${t.full_name} - ${t.roll_number ?? t.email}`)} />
            {plan.warnings.length > 0 && (
              <div>
                <p className="font-medium text-ink">Before you go ahead:</p>
                <PlanList items={plan.warnings} />
              </div>
            )}
            {plan.notFound.length > 0 && (
              <div>
                <p className="font-medium text-ink">No account found, so nothing happens for these:</p>
                <PlanList items={plan.notFound} />
              </div>
            )}
            {plan.refused.length > 0 && (
              <div>
                <p className="font-medium text-ink">Will not be changed:</p>
                <PlanList items={plan.refused} />
              </div>
            )}
            {plan.alreadyDone.length > 0 && (
              <p className="text-muted-foreground">
                {plan.alreadyDone.length} already {plan.action === "block" ? "blocked" : "allowed"}.
              </p>
            )}
            <Button type="button" disabled={pending || plan.targets.length === 0} onClick={apply}>
              {plan.action === "block"
                ? `Block ${plan.targets.length} ${plan.targets.length === 1 ? "account" : "accounts"}`
                : `Restore ${plan.targets.length} ${plan.targets.length === 1 ? "account" : "accounts"}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A long list stays readable: it scrolls rather than pushing the button away. */
function PlanList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-body">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
