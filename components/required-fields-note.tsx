import { cn } from "@/lib/utils";

/**
 * What the star on a label means (11 Oct 2026, the office: *'Mention "These
 * field are mandatory for those shown with *" whenever we are using it
 * [*]'*).
 *
 * One sentence, one wording, in every form that stars a field - the booking
 * form, Users & Roles, the rejection dialog. It sits **above** the first
 * starred label rather than at the foot of the form, so it is read before the
 * fields it describes, and it is the only place the convention is explained:
 * a per-field "(mandatory)" beside a star would say the same thing twice.
 */
export const MANDATORY_FIELDS_NOTE = "Fields marked with * are mandatory.";

export function RequiredFieldsNote({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>{MANDATORY_FIELDS_NOTE}</p>
  );
}
