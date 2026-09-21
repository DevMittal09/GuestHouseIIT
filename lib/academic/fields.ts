import type { Profile, Role } from "@/lib/types";
import type { AcademicRecord, AcademicRecordKind, StudentRecord } from "./types";

/**
 * Which academic record describes each kind of portal account.
 *
 * A `Record` over every role, so adding a role is a compile error here until
 * someone decides whether the academic database knows about it.
 */
const KIND_FOR_ROLE: Record<Role, AcademicRecordKind | null> = {
  student: "student",
  employee: "employee",
  // Institute offices book as `official` (the Director's Office, Registrar,
  // Academics…); the IAR Office is its own role but the same kind of record.
  official: "office",
  iar_cell: "office",
  // Clubs and fest councils are represented by their student representatives.
  club: "student_rep",
  // The IAR Student Cell account (alumnicell@) — "Alumni" in the office's
  // "two roles, Office and Alumni" for IAR.
  iar_student_cell: "alumni_office",
  warden: "warden",
  // Retired, and alumni never had an institute login.
  alumni: null,
  faculty_advisor: null,
  gh_manager: null,
  gh_caretaker: null,
  developer: null,
};

export function academicRecordKindFor(role: Role): AcademicRecordKind | null {
  return KIND_FOR_ROLE[role];
}

export const ACADEMIC_KIND_LABELS: Record<AcademicRecordKind, string> = {
  student: "Student",
  employee: "Faculty / Non-faculty",
  office: "Office",
  student_rep: "Student Representative",
  alumni_office: "Alumni Office",
  warden: "Warden / Assistant Warden",
};

/**
 * Who a request is copied to, by kind of account.
 *
 * - `approver`: whoever approves it on the portal — found through `canReview()`
 *   on the requester's profile, the same rule that routes the request.
 * - `head_of_department`: the head named on the office's own record. Not a
 *   portal approver; offices go straight to the Guest House Manager.
 */
export type CopyToRule = "approver" | "head_of_department";

export const COPY_TO_RULE: Record<AcademicRecordKind, CopyToRule | null> = {
  student: "approver",
  employee: null,
  office: "head_of_department",
  student_rep: "approver",
  alumni_office: null,
  warden: null,
};

export type DetailRow = { label: string; value: string | null };

/** The fields shown for a record, in the order the office listed them. */
export function academicRecordRows(record: AcademicRecord): DetailRow[] {
  switch (record.kind) {
    case "student":
      return [
        { label: "Roll Number", value: record.roll_number },
        { label: "Name", value: record.name },
        { label: "Program", value: record.program },
        { label: "Department", value: record.department },
        { label: "Email ID", value: record.email },
        { label: "Phone Number", value: record.phone },
        ...parentRows(record),
        { label: "Hostel", value: record.hostel },
      ];
    case "employee":
      return [
        { label: "Employee ID", value: record.employee_id },
        { label: "Name", value: record.name },
        { label: "Department", value: record.department },
        { label: "Employee Type", value: record.employee_type },
        { label: "Phone Number", value: record.phone },
        { label: "Email ID", value: record.email },
        { label: "Office Number", value: record.office_number },
      ];
    case "office":
      return [
        { label: "Department", value: record.department },
        { label: "Email ID", value: record.email },
        { label: "Phone Number", value: record.phone },
      ];
    case "student_rep":
      return [
        { label: "Type of Representative", value: record.representative_type },
        { label: "Email ID", value: record.email },
        { label: "Phone Number", value: record.phone },
        { label: "Faculty in Charge Email", value: record.faculty_in_charge_email },
      ];
    case "alumni_office":
      return [
        { label: "Department", value: record.department },
        { label: "Email ID", value: record.email },
        { label: "Phone Number", value: record.phone },
      ];
    case "warden":
      return [
        { label: "Name", value: record.name },
        { label: "Phone Number", value: record.phone },
        { label: "Email", value: record.email },
        { label: "Hostel", value: record.hostel },
      ];
  }
}

/**
 * The guardian stands in for the parents, and only when the database has
 * neither parent's name. One missing parent is shown as missing, not replaced.
 */
function parentRows(record: StudentRecord): DetailRow[] {
  if (!record.father_name && !record.mother_name) {
    return [{ label: "Guardian's Name", value: record.guardian_name }];
  }
  return [
    { label: "Father's Name", value: record.father_name },
    { label: "Mother's Name", value: record.mother_name },
  ];
}

/**
 * What the portal itself knows, for when the academic database has no record
 * or cannot be reached — and for accounts it never describes, like the Guest
 * House Manager booking at the desk. Only the fields that are set.
 */
export function profileRows(profile: Profile): DetailRow[] {
  const rows: DetailRow[] = [
    { label: "Name", value: profile.full_name },
    { label: "Email", value: profile.email },
  ];
  if (profile.roll_number) rows.push({ label: "Roll Number", value: profile.roll_number });
  if (profile.hostel_name) rows.push({ label: "Hostel", value: profile.hostel_name });
  if (profile.department_or_club) {
    rows.push({ label: "Department / Club", value: profile.department_or_club });
  }
  return rows;
}
