/**
 * Email rendering: one block list in, an HTML body and a plain-text body out.
 *
 * **Both bodies come from the same blocks on purpose.** Every mail client that
 * refuses HTML — and every screen reader, and every "view source" during a
 * support call — reads the text part, so a template that writes the two
 * separately drifts until the text version is wrong. Describing the content
 * once and rendering it twice makes that impossible.
 *
 * Constraints that shape the markup, none of them negotiable in email:
 * - tables for layout, inline styles only (Gmail strips `<style>` blocks and
 *   most clients ignore external CSS),
 * - no external images (they are blocked by default and the portal may be on
 *   localhost anyway), so the wordmark is text,
 * - no ID-document links, ever — those go to the portal behind a login.
 *
 * Palette is the institute's, from `app/globals.css`: amber #f7a600 on warm
 * off-white #faf9f7, text #2b2b2b, borders #e3e1dc. The header uses dark brown
 * on amber rather than the site's white-on-amber, which fails WCAG AA — the
 * fix `AGENTS.md` recommends, applied here from the start.
 */

const AMBER = "#f7a600";
const INK = "#2b2b2b";
const MUTED = "#6b6862";
const PAPER = "#faf9f7";
const CARD = "#ffffff";
const BORDER = "#e3e1dc";
const ON_AMBER = "#3d2a00";

const TONES = {
  info: { bg: "#fff8e8", border: AMBER, heading: "#7a5200" },
  success: { bg: "#effaf1", border: "#22c55e", heading: "#14622f" },
  warning: { bg: "#fff1e6", border: "#f97316", heading: "#8a3a06" },
  danger: { bg: "#fdeeee", border: "#ef4444", heading: "#8c1c1c" },
} as const;

export type Tone = keyof typeof TONES;

export type Block =
  | { kind: "paragraph"; text: string }
  /** Label/value pairs — the booking's facts. Renders as a two-column table. */
  | { kind: "facts"; rows: [string, string][] }
  /** A boxed remark: a rejection reason, the room numbers, what to bring. */
  | { kind: "callout"; tone: Tone; title?: string; lines: string[] }
  | { kind: "table"; caption?: string; head: string[]; rows: string[][] }
  | { kind: "list"; items: string[] }
  | { kind: "button"; label: string; href: string }
  /** Small print under the body — why you received this, mostly. */
  | { kind: "note"; text: string };

export interface EmailDocument {
  /** The `<h1>`, and the first line of the text part. */
  heading: string;
  /** One line shown in the inbox preview next to the subject. Keep it useful. */
  preheader: string;
  blocks: Block[];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------- HTML

function htmlParagraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escapeHtml(text)}</p>`;
}

function htmlFacts(rows: [string, string][]): string {
  const cells = rows
    .map(
      ([label, value], i) => `
        <tr>
          <th align="left" style="padding:10px 12px;font-size:13px;font-weight:600;color:${MUTED};background:${PAPER};border-top:${i === 0 ? "0" : `1px solid ${BORDER}`};width:38%;vertical-align:top;">${escapeHtml(label)}</th>
          <td style="padding:10px 12px;font-size:14px;color:${INK};border-top:${i === 0 ? "0" : `1px solid ${BORDER}`};vertical-align:top;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BORDER};border-radius:8px;border-collapse:separate;overflow:hidden;margin:0 0 20px;">${cells}</table>`;
}

function htmlCallout(tone: Tone, title: string | undefined, lines: string[]): string {
  const t = TONES[tone];
  const heading = title
    ? `<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:0.02em;text-transform:uppercase;color:${t.heading};">${escapeHtml(title)}</p>`
    : "";
  const body = lines
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(line)}</p>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;"><tr><td style="padding:14px 16px;background:${t.bg};border-left:4px solid ${t.border};border-radius:6px;">${heading}${body}</td></tr></table>`;
}

function htmlTable(caption: string | undefined, head: string[], rows: string[][]): string {
  const captionHtml = caption
    ? `<p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${MUTED};">${escapeHtml(caption)}</p>`
    : "";
  const headHtml = head
    .map(
      (cell) =>
        `<th align="left" style="padding:8px 10px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.03em;color:${MUTED};background:${PAPER};border-bottom:1px solid ${BORDER};">${escapeHtml(cell)}</th>`
    )
    .join("");
  const bodyHtml =
    rows.length === 0
      ? `<tr><td colspan="${head.length}" style="padding:12px 10px;font-size:14px;color:${MUTED};">Nothing to report.</td></tr>`
      : rows
          .map(
            (row) =>
              `<tr>${row
                .map(
                  (cell) =>
                    `<td style="padding:9px 10px;font-size:14px;color:${INK};border-bottom:1px solid ${BORDER};vertical-align:top;">${escapeHtml(cell)}</td>`
                )
                .join("")}</tr>`
          )
          .join("");
  return `${captionHtml}<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border:1px solid ${BORDER};border-radius:8px;border-collapse:collapse;margin:0 0 20px;"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

function htmlList(items: string[]): string {
  const li = items
    .map(
      (item) =>
        `<li style="margin:0 0 6px;font-size:15px;line-height:1.55;color:${INK};">${escapeHtml(item)}</li>`
    )
    .join("");
  return `<ul style="margin:0 0 20px;padding-left:22px;">${li}</ul>`;
}

function htmlButton(label: string, href: string): string {
  // A table-wrapped anchor, because Outlook ignores padding on inline links.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;"><tr><td style="background:${AMBER};border-radius:6px;"><a href="${escapeHtml(href)}" style="display:inline-block;padding:11px 22px;font-size:15px;font-weight:600;color:${ON_AMBER};text-decoration:none;">${escapeHtml(label)}</a></td></tr></table>`;
}

function htmlNote(text: string): string {
  return `<p style="margin:0 0 12px;font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(text)}</p>`;
}

function renderBlockHtml(block: Block): string {
  switch (block.kind) {
    case "paragraph":
      return htmlParagraph(block.text);
    case "facts":
      return htmlFacts(block.rows);
    case "callout":
      return htmlCallout(block.tone, block.title, block.lines);
    case "table":
      return htmlTable(block.caption, block.head, block.rows);
    case "list":
      return htmlList(block.items);
    case "button":
      return htmlButton(block.label, block.href);
    case "note":
      return htmlNote(block.text);
  }
}

// ---------------------------------------------------------------- text

/** Pad a row's cells so a text-part table stays legible in a monospace client. */
function textTable(head: string[], rows: string[][]): string[] {
  const all = [head, ...rows];
  const widths = head.map((_, col) =>
    Math.max(...all.map((row) => (row[col] ?? "").length))
  );
  const line = (row: string[]) =>
    row.map((cell, col) => (cell ?? "").padEnd(widths[col])).join("  ").trimEnd();
  const out = [line(head), widths.map((w) => "-".repeat(w)).join("  ")];
  if (rows.length === 0) return [...out, "(nothing to report)"];
  return [...out, ...rows.map(line)];
}

function renderBlockText(block: Block): string[] {
  switch (block.kind) {
    case "paragraph":
      return [block.text, ""];
    case "facts":
      return [...block.rows.map(([label, value]) => `${label}: ${value}`), ""];
    case "callout":
      return [
        ...(block.title ? [block.title.toUpperCase()] : []),
        ...block.lines,
        "",
      ];
    case "table":
      return [...(block.caption ? [block.caption] : []), ...textTable(block.head, block.rows), ""];
    case "list":
      return [...block.items.map((item) => `- ${item}`), ""];
    case "button":
      return [`${block.label}: ${block.href}`, ""];
    case "note":
      return [block.text, ""];
  }
}

// ---------------------------------------------------------------- document

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Wrap a document in the branded shell. */
export function renderEmail(
  doc: EmailDocument,
  options: { footerLines?: string[] } = {}
): RenderedEmail {
  const { footerLines = [] } = options;

  const body = doc.blocks.map(renderBlockHtml).join("");

  const footer = [
    "This is an automated message from the IIT Palakkad Guest House Booking Portal.",
    ...footerLines,
  ]
    .map(
      (line) =>
        `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(line)}</p>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(doc.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(doc.preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${PAPER};">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:100%;max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <tr>
          <td style="padding:18px 24px;background:${AMBER};border-radius:10px 10px 0 0;">
            <p style="margin:0;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:${ON_AMBER};">IIT Palakkad</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:500;color:${ON_AMBER};opacity:0.82;">Guest House Booking Portal</p>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px;background:${CARD};border:1px solid ${BORDER};border-top:0;border-radius:0 0 10px 10px;">
            <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:650;color:${INK};">${escapeHtml(doc.heading)}</h1>
            ${body}
          </td>
        </tr>
        <tr>
          <td style="padding:18px 24px 0;">${footer}</td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const textLines = [
    "IIT PALAKKAD — GUEST HOUSE BOOKING PORTAL",
    "=========================================",
    "",
    doc.heading,
    "-".repeat(doc.heading.length),
    "",
    ...doc.blocks.flatMap(renderBlockText),
    "--",
    "This is an automated message from the IIT Palakkad Guest House Booking Portal.",
    ...footerLines,
  ];

  // Collapse runs of blank lines the block renderers leave behind.
  const text = textLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return { html, text };
}
