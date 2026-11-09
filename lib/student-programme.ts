/**
 * **Which programme a student is on, read from their roll number** (9 Nov
 * 2026, the meeting).
 *
 * The office's rule: a regular B.Tech or M.Tech student may not book a room
 * for a spouse, and a research scholar - MS or PhD - may, without a parent
 * having to come too. Identification is "based on the roll number
 * convention", in the institute's own words:
 *
 * | Programme | Roll number |
 * | --- | --- |
 * | B.Tech | `xxxxx1xxx` |
 * | M.Tech | `xxxxx2xxx` |
 * | MS     | `xxxxx3xxx` |
 * | PhD    | `xxxxx4xxx` |
 *
 * So the **sixth digit** of a nine-digit roll number is the programme, and
 * everything here is that one fact. It is deliberately not a list of
 * programme *names*: the institute writes "B.Tech", "BTech" and "B. Tech" in
 * its own spreadsheets, and a rule keyed on those strings would have to grow
 * every time somebody typed a new one. The roll number is issued by the
 * institute and cannot be typed by the person it describes.
 *
 * **The name is only a fallback**, for a student whose roll number is missing
 * or does not follow the convention at all. Without either the answer is
 * `null`, and the caller decides what to do about not knowing - which, for
 * the spouse rule, is to withhold the option and say why.
 */

export const STUDENT_PROGRAMMES = ["btech", "mtech", "ms", "phd"] as const;

export type StudentProgramme = (typeof STUDENT_PROGRAMMES)[number];

export const STUDENT_PROGRAMME_LABELS: Record<StudentProgramme, string> = {
  btech: "B.Tech",
  mtech: "M.Tech",
  ms: "MS",
  phd: "PhD",
};

/**
 * The research degrees. A scholar is on campus for years rather than terms
 * and is routinely married, which is the whole reason the office separates
 * them from the taught programmes.
 */
export const RESEARCH_PROGRAMMES: StudentProgramme[] = ["ms", "phd"];

/** The sixth digit of the roll number, by programme. */
const DIGIT_TO_PROGRAMME: Record<string, StudentProgramme> = {
  "1": "btech",
  "2": "mtech",
  "3": "ms",
  "4": "phd",
};

/** Position of the programme digit in a roll number, counting from zero. */
const PROGRAMME_DIGIT_INDEX = 5;

/** Roll numbers are nine digits; anything else is not one. */
const ROLL_NUMBER = /^\d{9}$/;

/**
 * The programme this roll number names, or null when it is absent, is not
 * nine digits, or carries a programme digit the institute has not published.
 *
 * A digit outside 1-4 reads as **unknown** rather than as a guess: the
 * institute may add a programme, and inventing an answer for it would quietly
 * decide a rule about somebody's family.
 */
export function programmeFromRollNumber(
  rollNumber: string | null | undefined
): StudentProgramme | null {
  const digits = (rollNumber ?? "").trim();
  if (!ROLL_NUMBER.test(digits)) return null;
  return DIGIT_TO_PROGRAMME[digits[PROGRAMME_DIGIT_INDEX]] ?? null;
}

/**
 * The programme named in words, for a record whose roll number cannot answer.
 * Matched on the letters alone, so "B.Tech", "BTech" and "B. Tech" are one
 * answer - and so "M.Tech" is never read as "MS", which a naive `includes`
 * would do in the other direction.
 */
export function programmeFromName(name: string | null | undefined): StudentProgramme | null {
  const letters = (name ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!letters) return null;
  if (letters.startsWith("btech") || letters.startsWith("bachelor")) return "btech";
  if (letters.startsWith("mtech") || letters.startsWith("master of tech")) return "mtech";
  if (letters.startsWith("phd") || letters.startsWith("doctor")) return "phd";
  if (letters.startsWith("ms") || letters.startsWith("mscby") || letters === "msresearch") {
    return "ms";
  }
  return null;
}

/**
 * The programme for a student, roll number first and the written programme
 * only where the roll number cannot say.
 */
export function studentProgramme(student: {
  roll_number?: string | null;
  programme?: string | null;
  program?: string | null;
}): StudentProgramme | null {
  return (
    programmeFromRollNumber(student.roll_number)
  );
}

/** Whether this programme is a research degree. */
export function isResearchProgramme(programme: StudentProgramme | null): boolean {
  return programme !== null && RESEARCH_PROGRAMMES.includes(programme);
}

/**
 * Whether this student is a research scholar - **false when the programme
 * cannot be established**, which is the safe reading: the rule it feeds
 * withholds an option rather than granting one, and the office can correct
 * the record.
 */
export function isResearchScholar(student: {
  roll_number?: string | null;
  programme?: string | null;
  program?: string | null;
}): boolean {
  return isResearchProgramme(studentProgramme(student));
}

// ------------------------------------------------------------------ spouse

/**
 * The relationship the rule is about, as the Form Builder spells it by
 * default. Matched ignoring case and spacing wherever it is applied, so
 * renaming the option in the Form Builder simply stops the rule biting rather
 * than producing a form nobody can submit - the same behaviour as the locked
 * parent names.
 */
export const SPOUSE_RELATIONSHIP = "Spouse";

/** The rule in a dropdown option's worth of words. */
export const SPOUSE_SCHOLARS_ONLY = "MS and PhD research scholars only";

/**
 * Why this student may not book for a spouse, or null when they may.
 *
 * Three answers, and the difference is the point: a taught-programme student
 * is told the rule, a student the portal cannot place is told what is missing
 * from their record, and a scholar is told nothing because nothing is in
 * their way.
 */
export function spouseBookingError(student: {
  roll_number?: string | null;
  programme?: string | null;
  program?: string | null;
}): string | null {
  const programme = studentProgramme(student);
  if (programme === null) {
    return "A spouse can be booked by MS and PhD research scholars only, and your programme is not recorded. Ask the guest house office to add your roll number.";
  }
  if (isResearchProgramme(programme)) return null;
  return `A spouse can be booked by MS and PhD research scholars only - your record shows ${STUDENT_PROGRAMME_LABELS[programme]}.`;
}
