# Paste-ready Claude Code prompt

```
Implement the IIT Palakkad Guest House site design into this codebase.

The design reference is `design_handoff_guest_house_site/IIT Palakkad Guest House.dc.html`
plus `design_handoff_guest_house_site/README.md`. Read BOTH before writing code.

Important: the .dc.html file is a design prototype, not production code. Do not copy it
in. Recreate it using this project's existing stack, routing, templating, component
patterns, and build pipeline. Match the visuals pixel-for-pixel; match the code to the
codebase.

Steps:
1. Inspect the repo first and tell me what you found: framework/CMS, theme or component
   directory, how existing pages and navigation are defined, how CSS is authored
   (global stylesheet, SCSS, CSS modules, Tailwind, Drupal theme, etc.), and how auth is
   handled if at all. Do not start coding until you have reported this.
2. Propose a file-by-file plan and wait for my approval.
3. Then implement it.

What to build — seven top-level sections, in this order in the main nav:
  Home, Book a Room, Book Meal, Guidelines, Gallery, Contact Us,
  and an external link to https://iitpkd.ac.in

Build these as real routes/pages (one URL per tab), not a single-page JS tab widget,
unless the codebase already does client-side tabs for equivalent content. The prototype
uses in-page state only because it is a single standalone file.

Hard requirements:
- Visual fidelity: use the exact colors, type scale, spacing, and borders documented in
  README.md. Navy #12284C, gold #E8A317, dark bar #0C1D38, body text #41506A,
  borders #E1E5EC, grey band #F1F3F6. Headings Source Serif 4, UI/body Source Sans 3.
- Responsive from 320px up. Every grid must collapse rather than force a minimum column
  width; no horizontal scroll at 320px. Verify this.
- Accessibility: real <nav>/<main>/<footer> landmarks, one <h1> per page, visible focus
  states, labelled form fields, alt text on images, 4.5:1 text contrast.
- The two login screens are UI only in the prototype. Wire them to the institute's
  existing SSO/auth if this codebase has one; otherwise stub the submit handler and
  leave a clearly marked TODO. Enforce the institute email domain on the client AND
  leave a note that it must be enforced server-side too.
- Images in the prototype are drag-and-drop placeholder slots. Replace each with a real
  <img> (or the codebase's image component) pointing at an asset path, and leave the
  filenames as TODOs where I have not supplied a photo yet. Do not ship the
  image-slot.js component.
- Content: use the copy in the prototype verbatim. The facilities list, the guideline
  bullets, the phone number and the guest house email are placeholders I still need to
  confirm — keep them but mark them with a TODO comment so I can find them.
- The Guidelines page links to a full PDF; make the PDF URL a single configurable value.
- Contact page embeds the institute's existing Google Maps embed URL (in the README).

Do not redesign anything, do not add sections, and do not introduce a new CSS framework
or dependency without asking me first.

When done: list every file you created or changed, and tell me what is still TODO.
```
