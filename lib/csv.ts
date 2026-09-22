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
