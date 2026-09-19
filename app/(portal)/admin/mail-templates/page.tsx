import { MailTemplateEditor } from "@/components/admin/mail-template-editor";
import { listMailTemplates } from "@/app/actions/mail-templates";

export default async function MailTemplatesPage() {
  // The action re-checks the section and the console unlock, so this page
  // cannot be reached by URL alone even if the layout's tab is hidden.
  const templates = await listMailTemplates();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Email Templates</h2>
        <p className="text-sm text-muted-foreground">
          Every automatic email the portal sends, what it is for, and the wording you can change.
        </p>
      </div>
      <MailTemplateEditor templates={templates} />
    </section>
  );
}
