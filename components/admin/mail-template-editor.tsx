"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  resetMailTemplateAction,
  saveMailTemplateAction,
} from "@/app/actions/mail-templates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  isEdited,
  mailEventLabel,
  MAIL_EVENT_NOTES,
  SUBJECT_TOKENS,
  type MailTemplateOverride,
} from "@/lib/mail/template-config";
import { MAIL_THREAD_OF, type MailEventKey } from "@/lib/mail/types";

/**
 * What every automatic email says, and the four things about it the guest
 * house can change without a developer.
 *
 * The bodies are assembled from the booking in `lib/mail/templates.ts` and
 * are **not** editable here — a free-text editor over "check-in, check-out,
 * rooms allocated" could only produce a mail that contradicts the database.
 * What is editable is the wording around those facts.
 */
export function MailTemplateEditor({ templates }: { templates: MailTemplateOverride[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">How these work</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            The body of each mail — dates, rooms, the party, the approval trail — is built from
            the booking itself and cannot be edited here. It would only ever disagree with the
            booking.
          </li>
          <li>
            Leave a field blank to use the built-in wording. <strong>Reset</strong> throws every
            edit away and goes back to it.
          </li>
          <li>
            Turning one off stops that mail going out at all. Nothing else changes — the booking
            still moves through the same stages.
          </li>
          <li>
            Adding a genuinely new <em>kind</em> of mail needs a developer: something in the code
            has to decide when to send it.
          </li>
        </ul>
      </div>

      {templates.map((t) => (
        <TemplateRow key={t.event_key} template={t} />
      ))}
    </div>
  );
}

function TemplateRow({ template }: { template: MailTemplateOverride }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(template.enabled);
  const [subject, setSubject] = useState(template.subject ?? "");
  const [intro, setIntro] = useState(template.intro ?? "");
  const [outro, setOutro] = useState(template.outro ?? "");
  const [cc, setCc] = useState(template.cc.join("\n"));

  const notes = MAIL_EVENT_NOTES[template.event_key as MailEventKey];
  const edited = isEdited(template);

  const save = () =>
    startTransition(async () => {
      const result = await saveMailTemplateAction({
        event_key: template.event_key,
        enabled,
        subject,
        intro,
        outro,
        cc,
      });
      if (result.ok) {
        toast.success(`${mailEventLabel(template.event_key as MailEventKey)} saved`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  const reset = () =>
    startTransition(async () => {
      const result = await resetMailTemplateAction(template.event_key);
      if (result.ok) {
        setEnabled(true);
        setSubject("");
        setIntro("");
        setOutro("");
        setCc("");
        toast.success("Back to the built-in wording");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-4 text-left hover:bg-muted/40"
      >
        <span className="font-medium">{mailEventLabel(template.event_key as MailEventKey)}</span>
        {!template.enabled && <Badge variant="destructive">Off</Badge>}
        {edited && template.enabled && <Badge variant="secondary">Edited</Badge>}
        {template.cc.length > 0 && (
          <Badge variant="outline">
            +{template.cc.length} copied
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">{open ? "Close" : "Edit"}</span>
        <span className="w-full text-xs text-muted-foreground">
          {notes ? `${notes.audience}. ${notes.when}` : template.event_key}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {enabled ? "This email is being sent" : "This email is switched off"}
          </label>

          <div className="space-y-2">
            <Label htmlFor={`subject-${template.event_key}`}>Subject</Label>
            <Input
              id={`subject-${template.event_key}`}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Leave blank for the built-in subject"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground">
              A custom subject replaces the whole line, including the reference prefix. You can
              use:{" "}
              {SUBJECT_TOKENS.map((t, i) => (
                <span key={t.token}>
                  {i > 0 && ", "}
                  <code className="rounded bg-muted px-1">{t.token}</code>
                </span>
              ))}
              .
              {MAIL_THREAD_OF[template.event_key] && (
                <>
                  {" "}
                  This email joins the recipient&rsquo;s daily{" "}
                  {MAIL_THREAD_OF[template.event_key] === "approvals" ? "approvals" : "log"} thread,
                  whose subject stays the same all day so mail clients keep it together — a custom
                  subject is shown as the message&rsquo;s preview line instead.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`intro-${template.event_key}`}>Opening paragraph</Label>
            <Textarea
              id={`intro-${template.event_key}`}
              rows={2}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              placeholder="Added above the booking details. Leave blank for none."
              disabled={!enabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`outro-${template.event_key}`}>Closing note</Label>
            <Textarea
              id={`outro-${template.event_key}`}
              rows={2}
              value={outro}
              onChange={(e) => setOutro(e.target.value)}
              placeholder="Small print at the foot — e.g. bring a photo ID to reception."
              disabled={!enabled}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor={`cc-${template.event_key}`}>Always copy</Label>
            <Textarea
              id={`cc-${template.event_key}`}
              rows={2}
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="one.address@iitpkd.ac.in&#10;another@iitpkd.ac.in"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground">
              One per line. Anyone already receiving the mail is not copied twice.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
            {edited && (
              <Button type="button" variant="outline" onClick={reset} disabled={isPending}>
                Reset to built-in
              </Button>
            )}
            <Button type="button" onClick={save} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
