/**
 * Client-side CSV / XLSX file reader for academic record imports.
 *
 * Reads a File object and returns its content as comma-separated text that
 * `planAcademicImport` can parse directly. XLSX uses the first sheet only.
 */

export const ACCEPTED_EXTENSIONS = ".csv,.xlsx,.xls";
export const ACCEPTED_MIME =
  "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export class FileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileParseError";
  }
}

function isExcel(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".xlsx") || name.endsWith(".xls");
}

async function readCsv(file: File): Promise<string> {
  return file.text();
}

async function readExcel(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new FileParseError("The file has no sheets");
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
}

export async function parseFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new FileParseError(
      `The file is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 10 MB`
    );
  }
  if (file.size === 0) {
    throw new FileParseError("The file is empty");
  }
  const text = isExcel(file) ? await readExcel(file) : await readCsv(file);
  if (!text.trim()) {
    throw new FileParseError("The file has no data");
  }
  return text;
}
