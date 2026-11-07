/**
 * One CSV cell. Spreadsheets execute cells that begin with a formula
 * character, and most text in an export is user-supplied, so those are
 * neutralised; then everything is quoted.
 */
export function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "").replace(/[\r\n]+/g, " ");
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvLine(values: (string | number | null | undefined)[]): string {
  return values.map(csvCell).join(",");
}

/**
 * Split one CSV line. Handles the quoting a spreadsheet produces - a quoted
 * field may contain commas and doubled quotes - because the office pastes
 * straight out of Excel, where a department called "Physics, Applied" is an
 * ordinary thing to have.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      continue;
    }
    if (c === "," || c === "\t" || c === ";") {
      out.push(field);
      field = "";
      continue;
    }
    field += c;
  }
  out.push(field);
  return out.map((f) => f.trim());
}
