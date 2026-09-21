import { redirect } from "next/navigation";

/**
 * The faculty advisor's queue now lives at `/approvals`, alongside every
 * other approval by appointment — HODs and council secretaries included. This
 * keeps old links and bookmarks working.
 */
export default function FaPage() {
  redirect("/approvals");
}
