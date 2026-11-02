/**
 * Client-side CSV / XLSX file reader for academic record imports.
 *
 * Reads a File object and returns its content as comma-separated text that
 * `planAcademicImport` can parse directly. XLSX uses the first sheet only.
 *
 * Uses `read-excel-file` instead of the former `xlsx` package, which had
 * unpatched Prototype Pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS
 * (GHSA-5pgg-2g8v-p4x9) vulnerabilities.
 */

export const ACCEPTED_EXTENSIONS = ".csv,.xlsx";
export const ACCEPTED_MIME =
  "text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export class FileParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileParseError";
  }
}

function isExcel(file: File): boolean {
  return file.name.toLowerCase().endsWith(".xlsx");
}

async function readCsv(file: File): Promise<string> {
  return file.text();
}

function escapeCsvField(value: string): string {
  if (/[,"\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

async function readExcel(file: File): Promise<string> {
  const readXlsxFile = (await import("read-excel-file")).default;
  const buffer = await file.arrayBuffer();
  const rows = await readXlsxFile(buffer);
  if (rows.length === 0) throw new FileParseError("The file has no data");
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined) return "";
          const s = String(cell).replace(/\r?\n/g, " ");
          return escapeCsvField(s);
        })
        .join(",")
    )
    .join("\n");
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
