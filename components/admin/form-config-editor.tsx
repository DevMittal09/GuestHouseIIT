"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { resetRoleFormConfig, saveRoleFormConfig } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildDefaultFormConfig,
  GUEST_FIELD_LABELS,
  type CustomField,
  type CustomFieldType,
  type FieldMode,
  type RoleFormConfig,
} from "@/lib/form-config";
import { cn } from "@/lib/utils";
import { REQUESTER_ROLES, ROLE_LABELS, type GuestHouse, type Role } from "@/lib/types";

const MODES: FieldMode[] = ["required", "optional", "hidden"];
const CUSTOM_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
];

export function FormConfigEditor({
  initialConfigs,
  guestHouses,
}: {
  initialConfigs: Partial<Record<Role, RoleFormConfig>>;
  guestHouses: GuestHouse[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<Role>("student");
  const [configs, setConfigs] = useState(initialConfigs);

  const config = configs[role]!;
  const update = (patch: Partial<RoleFormConfig>) =>
    setConfigs((prev) => ({ ...prev, [role]: { ...prev[role]!, ...patch } }));

  const save = () =>
    startTransition(async () => {
      const result = await saveRoleFormConfig(config);
      if (result.ok) {
        toast.success(`${ROLE_LABELS[role]} form saved`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const reset = () =>
    startTransition(async () => {
      const result = await resetRoleFormConfig(role);
      if (result.ok) {
        setConfigs((prev) => ({ ...prev, [role]: buildDefaultFormConfig(role, guestHouses) }));
        toast.success(`${ROLE_LABELS[role]} form reset to spec defaults`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const addCustomField = () =>
    update({
      custom_fields: [
        ...config.custom_fields,
        {
          id: `cf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          label: "",
          type: "text",
          options: [],
          required: false,
        },
      ],
    });

  const updateCustomField = (id: string, patch: Partial<CustomField>) =>
    update({
      custom_fields: config.custom_fields.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    });

  const removeCustomField = (id: string) =>
    update({ custom_fields: config.custom_fields.filter((f) => f.id !== id) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 w-fit">
        {REQUESTER_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              r === role ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {ROLE_LABELS[r]}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed guest houses</CardTitle>
          <CardDescription>
            Which guest houses a {ROLE_LABELS[role]} can pick on the booking form.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          {guestHouses.map((gh) => {
            const checked = config.allowed_guest_house_ids.includes(gh.id);
            return (
              <label key={gh.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={checked}
                  onChange={(e) =>
                    update({
                      allowed_guest_house_ids: e.target.checked
                        ? [...config.allowed_guest_house_ids, gh.id]
                        : config.allowed_guest_house_ids.filter((id) => id !== gh.id),
                    })
                  }
                />
                {gh.name}
              </label>
            );
          })}
          {config.allowed_guest_house_ids.length === 0 && (
            <p className="text-sm text-destructive">Select at least one guest house.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest fields</CardTitle>
          <CardDescription>
            Make each per-guest field required, optional, or hide it from the form entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(Object.keys(GUEST_FIELD_LABELS) as (keyof typeof GUEST_FIELD_LABELS)[]).map((key) => (
            <div key={key} className="space-y-2">
              <Label>{GUEST_FIELD_LABELS[key]}</Label>
              <NativeSelect
                value={config.guest_fields[key]}
                onChange={(e) =>
                  update({
                    guest_fields: { ...config.guest_fields, [key]: e.target.value as FieldMode },
                  })
                }
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ))}
          <div className="space-y-2">
            <Label>Relationship input style</Label>
            <NativeSelect
              value={config.relationship_style}
              onChange={(e) =>
                update({ relationship_style: e.target.value as "dropdown" | "free_text" })
              }
            >
              <option value="dropdown">Strict dropdown</option>
              <option value="free_text">Free text</option>
            </NativeSelect>
          </div>
          {config.relationship_style === "dropdown" && (
            <div className="space-y-2 sm:col-span-2">
              <Label>Relationship dropdown options (one per line)</Label>
              <Textarea
                rows={4}
                value={config.relationship_options.join("\n")}
                onChange={(e) =>
                  update({
                    relationship_options: e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>Alumni ID card upload</Label>
            <NativeSelect
              value={config.alumni_card}
              onChange={(e) => update({ alumni_card: e.target.value as FieldMode })}
            >
              {MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Banner under &ldquo;Number of rooms&rdquo; (empty = none)</Label>
            <Input
              value={config.banner_text ?? ""}
              onChange={(e) => update({ banner_text: e.target.value.trim() ? e.target.value : null })}
              placeholder="e.g. Double shared rooms will get first preference"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Custom fields <Badge variant="secondary">{config.custom_fields.length}</Badge>
          </CardTitle>
          <CardDescription>
            Extra questions shown in an &ldquo;Additional information&rdquo; section of the{" "}
            {ROLE_LABELS[role]} form. Answers are stored with each booking and shown to reviewers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.custom_fields.map((field) => (
            <div key={field.id} className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_10rem_auto_auto]">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={field.label}
                  placeholder="e.g. Vehicle number for campus entry"
                  onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                />
                {field.type === "select" && (
                  <Input
                    value={field.options.join(", ")}
                    placeholder="Options, comma separated"
                    onChange={(e) =>
                      updateCustomField(field.id, {
                        options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <NativeSelect
                  value={field.type}
                  onChange={(e) =>
                    updateCustomField(field.id, { type: e.target.value as CustomFieldType })
                  }
                >
                  {CUSTOM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <label className="flex items-center gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={field.required}
                  onChange={(e) => updateCustomField(field.id, { required: e.target.checked })}
                />
                Required
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => removeCustomField(field.id)}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={addCustomField}>
            + Add custom field
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={reset} disabled={isPending}>
          Reset to spec defaults
        </Button>
        <Button onClick={save} disabled={isPending || config.allowed_guest_house_ids.length === 0}>
          {isPending ? "Saving…" : `Save ${ROLE_LABELS[role]} form`}
        </Button>
      </div>
    </div>
  );
}
