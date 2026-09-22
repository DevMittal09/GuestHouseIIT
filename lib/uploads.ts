import "server-only";
import { randomUUID } from "crypto";

/**
 * What the portal accepts as an uploaded document (Phase 8): an ID card, a
 * passport page, an alumni card, a sanction letter.
 *
 * Three rules, in this order:
 *
 * 1. **The bytes decide the type**, not the filename or the browser's
 *    `Content-Type`: both are the uploader's to choose. A file whose first
 *    bytes are not one of the four accepted formats is refused, so `x.pdf`
 *    holding a script is never stored as a PDF.
 * 2. **Camera metadata is stripped.** A photograph of an ID card carries the
 *    GPS position, the phone and the time it was taken — none of which the
 *    guest house asked for. JPEG APPn segments and PNG text/EXIF chunks go.
 * 3. **The name is thrown away.** Files are stored under a random name with
 *    the extension of the sniffed type, so nothing in the path can be guessed,
 *    and nothing from the uploader's filesystem is kept.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export type UploadType = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXTENSIONS: Record<UploadType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** The file's real type from its first bytes, or null when it is not one we take. */
export function sniffUploadType(bytes: Uint8Array): UploadType | null {
  const b = Buffer.from(bytes.subarray(0, 16));
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  return null;
}

/**
 * JPEG: drop every APPn segment (EXIF, GPS, XMP, thumbnails) while keeping the
 * image data. PNG: drop eXIf, tEXt, iTXt, zTXt and time chunks. Other types are
 * returned unchanged — a PDF's metadata is inside its object graph, and
 * rewriting that needs a parser we are not going to add.
 */
export function stripMetadata(bytes: Uint8Array, type: UploadType): Uint8Array {
  if (type === "image/jpeg") return stripJpegAppSegments(Buffer.from(bytes));
  if (type === "image/png") return stripPngTextChunks(Buffer.from(bytes));
  return bytes;
}

function stripJpegAppSegments(buffer: Buffer): Buffer {
  const out: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  let i = 2;
  while (i + 4 <= buffer.length) {
    if (buffer[i] !== 0xff) break;
    const marker = buffer[i + 1];
    // Start of scan: the rest is entropy-coded image data.
    if (marker === 0xda) {
      out.push(buffer.subarray(i));
      return Buffer.concat(out);
    }
    const length = buffer.readUInt16BE(i + 2);
    const isAppSegment = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isAppSegment && !isComment) out.push(buffer.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  return Buffer.concat(out);
}

function stripPngTextChunks(buffer: Buffer): Buffer {
  const drop = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
  const out: Buffer[] = [buffer.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(i);
    const type = buffer.subarray(i + 4, i + 8).toString("ascii");
    const end = i + 12 + length;
    if (!drop.has(type)) out.push(buffer.subarray(i, end));
    if (type === "IEND") break;
    i = end;
  }
  return Buffer.concat(out);
}

/** A name nobody can guess, carrying only the sniffed type's extension. */
export function randomUploadName(type: UploadType): string {
  return `${randomUUID()}.${EXTENSIONS[type]}`;
}

export type PreparedUpload = { bytes: Uint8Array; type: UploadType; name: string };

/** Why this file cannot be stored, or the cleaned bytes ready to store. */
export async function prepareUpload(file: File): Promise<{ ok: true; file: PreparedUpload } | { ok: false; error: string }> {
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: "That file is larger than 5 MB" };
  const raw = new Uint8Array(await file.arrayBuffer());
  const type = sniffUploadType(raw);
  if (!type) return { ok: false, error: "Upload a JPG, PNG, WEBP or PDF — that file is none of them" };
  const bytes = stripMetadata(raw, type);
  const scan = await scanForViruses(bytes);
  if (!scan.ok) return { ok: false, error: scan.error };
  return { ok: true, file: { bytes, type, name: randomUploadName(type) } };
}

/**
 * Optional virus scan: when `CLAMAV_HOST` is set, the bytes are streamed to
 * clamd (INSTREAM) before they are stored. Without it, nothing is scanned and
 * the upload goes through — the office may not have a scanner, and refusing
 * every upload because of that would be worse.
 */
export async function scanForViruses(bytes: Uint8Array): Promise<{ ok: true } | { ok: false; error: string }> {
  const host = process.env.CLAMAV_HOST;
  if (!host) return { ok: true };
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  try {
    const net = await import("node:net");
    const verdict = await new Promise<string>((resolve, reject) => {
      const socket = net.connect({ host, port }, () => {
        socket.write("zINSTREAM\0");
        const size = Buffer.alloc(4);
        size.writeUInt32BE(bytes.length);
        socket.write(size);
        socket.write(Buffer.from(bytes));
        socket.write(Buffer.alloc(4)); // zero-length chunk ends the stream
      });
      let reply = "";
      socket.setTimeout(10_000, () => socket.destroy(new Error("clamd timed out")));
      socket.on("data", (chunk) => {
        reply += chunk.toString();
      });
      socket.on("end", () => resolve(reply));
      socket.on("error", reject);
    });
    if (/OK\0?$/.test(verdict.trim())) return { ok: true };
    console.error("[uploads] clamd rejected a file:", verdict.trim());
    return { ok: false, error: "That file did not pass the virus scan" };
  } catch (e) {
    // A scanner that is configured but unreachable is a failure to scan, and
    // an ID document is not urgent enough to store unscanned.
    console.error("[uploads] could not reach clamd:", e);
    return { ok: false, error: "The virus scanner is unavailable — try again shortly" };
  }
}
