import { MailTemplateEditor } from "@/components/admin/mail-template-editor";
import { listMailTemplates } from "@/app/actions/mail-templates";

export default async function MailTemplatesPage() {
  // The action re-checks the section and the console unlock, so this page
  // cannot be reached by URL alone even if the layout's tab is hidden. It
  // returns a result rather than throwing: a missing migration or a locked
  // console should say so here, not replace the console with an error page.
  const result = await listMailTemplates();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Email Templates</h2>
        <p className="text-sm text-muted-foreground">
          Every automatic email the portal sends, what it is for, and the wording you can change.
        </p>
      </div>
      {result.ok ? (
        <MailTemplateEditor templates={result.templates} />
      ) : (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="font-medium">Email templates are not available yet</p>
          <p className="mt-1">{result.error}</p>
          <p className="mt-2 text-amber-800 dark:text-amber-200">
            Mail is unaffected in the meantime — every message goes out with its built-in
            wording.
          </p>
        </div>
      )}
    </section>
  );
}
