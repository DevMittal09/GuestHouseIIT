import {
  ACADEMIC_RECORD_FIELDS,
  AcademicSourceUnavailableError,
  type AcademicRecord,
  type AcademicRecordKind,
  type AcademicSource,
} from "./types";

export type AcademicDbConfig = {
  /** Base URL of the records API, e.g. `https://erp.iitpkd.ac.in/api/guesthouse/`. */
  url: string;
  /** Sent as `Authorization: Bearer …` when set. */
  token: string | null;
};

/**
 * Short, because the booking page waits for it. The card streams in behind a
 * Suspense boundary, so a slow database delays only the card, never the form.
 */
const TIMEOUT_MS = 3000;

/**
 * The institute's academic database, over HTTP. The contract (also in
 * `.memories/17-academic-records.md`):
 *
 * ```
 * GET {ACADEMIC_DB_URL}/records/{kind}?email={institute email}
 * Authorization: Bearer {ACADEMIC_DB_TOKEN}      (only if set)
 *
 * 200 → one JSON object with that kind's fields (ACADEMIC_RECORD_FIELDS)
 * 404 → no such record
 * anything else, a timeout or a body that is not a JSON object → unavailable
 * ```
 *
 * If the institute's API names things differently, change `recordFromJson`
 * and nothing else.
 */
export class HttpAcademicSource implements AcademicSource {
  constructor(private readonly config: AcademicDbConfig) {}

  get description(): string {
    return this.config.url;
  }

  async find(kind: AcademicRecordKind, email: string): Promise<AcademicRecord | null> {
    let response: Response;
    try {
      // Built inside the try: a malformed ACADEMIC_DB_URL is an outage, not a crash.
      const base = this.config.url.endsWith("/") ? this.config.url : `${this.config.url}/`;
      const url = new URL(`records/${kind}`, base);
      url.searchParams.set("email", email);
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new AcademicSourceUnavailableError(e);
    }
    if (response.status === 404) return null;
    if (!response.ok) throw new AcademicSourceUnavailableError(`HTTP ${response.status}`);

    let body: unknown;
    try {
      body = await response.json();
    } catch (e) {
      throw new AcademicSourceUnavailableError(e);
    }
    return recordFromJson(kind, body);
  }
}

/**
 * The one place the database's field names meet ours. Unknown keys are
 * ignored; a missing, blank or non-text field becomes `null`, so one gap in a
 * record shows as "Not on record" rather than losing the whole card.
 */
export function recordFromJson(kind: AcademicRecordKind, body: unknown): AcademicRecord {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new AcademicSourceUnavailableError("response is not a JSON object");
  }
  const source = body as Record<string, unknown>;
  const fields: Record<string, string | null> = {};
  for (const field of ACADEMIC_RECORD_FIELDS[kind]) fields[field] = text(source[field]);
  return { kind, ...fields } as AcademicRecord;
}

function text(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
