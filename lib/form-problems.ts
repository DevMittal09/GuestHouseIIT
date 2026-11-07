/**
 * The booking form's **error summary** (7 Nov 2026, the owner: *"I don't
 * want any case where an error belongs to a question that isn't on
 * screen"*).
 *
 * Every problem found on submit - the zod pass, the checks outside it
 * (rooms, meals, uploads, the alumni card, custom fields) and a refusal from
 * the server - is listed at the top of the form, GOV.UK fashion. Each links
 * to its question **when that question is on screen**; one that is not is
 * still listed, in words. So a message can no longer exist only on a path
 * nothing renders, which is how "Please fix the highlighted fields" came to
 * be shown with nothing highlighted.
 *
 * Pure: the component resolves the selectors against the page.
 */

export type FormProblem = {
  message: string;
  /** Where the problem was reported - a form path, or a named slot. */
  path: string | null;
};

/**
 * The selectors that can stand for a problem's question, most specific
 * first. Several, because a path often names a value with no input of its
 * own (`check_in` is typed into `check_in_date`; a room card's guest list has
 * no input, its first guest's name does).
 */
export function problemSelectors(path: string | null): string[] {
  if (!path) return [];
  const byName = (p: string) => `[name="${p}"]`;
  const byId = (id: string) => `#${cssId(id)}`;
  const out: string[] = [byName(path), byId(path)];

  const guest = /^rooms\.(\d+)\.guests\.(\d+)(?:\.(\w+))?$/.exec(path);
  if (guest) {
    out.push(byName(`rooms.${guest[1]}.guests.${guest[2]}.name`));
    out.push(byName(`rooms.${guest[1]}.guests.0.name`));
  }
  const room = /^rooms\.(\d+)(?:\.guests)?$/.exec(path);
  if (room) out.push(byName(`rooms.${room[1]}.guests.0.name`));

  switch (path.split(".")[0]) {
    case "rooms":
      out.push(byId("rooms_requested"));
      break;
    case "check_in":
      out.push(byId("check_in_date"), byId("meals-section"));
      break;
    case "check_out":
      out.push(byId("check_out_date"), byId("meals-section"));
      break;
    case "meals":
    case "service_type":
    case "meal_diet_counts":
    case "meal_guest_count":
      out.push(byId("meal_guest_count"), byId("meals-section"));
      break;
    case "copy_to_emails":
    case "copy_to":
      out.push(byName("copy_to.0.email"));
      break;
    case "custom":
      if (path.split(".")[1]) out.push(byId(path.split(".")[1]));
      break;
  }
  return [...new Set(out)];
}

/** An id is free text in a custom field; escape what a selector would choke on. */
function cssId(id: string): string {
  return id.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}

/**
 * The list to show: one entry per distinct message and question, in the
 * order found. The same message on two different guests is two entries -
 * they are two things to fix.
 */
export function collectProblems(found: FormProblem[]): FormProblem[] {
  const seen = new Set<string>();
  const out: FormProblem[] = [];
  for (const p of found) {
    const message = p.message.trim();
    if (!message) continue;
    const key = `${p.path ?? ""}\u0000${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ message, path: p.path });
  }
  return out;
}

/** The toast that goes with the summary: the message itself when there is one. */
export function problemToast(problems: FormProblem[]): string {
  if (problems.length === 0) return "";
  if (problems.length === 1) return problems[0].message;
  return `${problems.length} things need fixing - they are listed at the top of the form`;
}
