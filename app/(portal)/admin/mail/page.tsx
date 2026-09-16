import { MailOutbox } from "@/components/admin/mail-outbox";

/** Reachable only through the admin layout, which enforces the console unlock. */
export default function MailOutboxPage() {
  return <MailOutbox />;
}
