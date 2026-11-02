/**
 * Converts institute_* table rows into the AcademicRecord shapes that the
 * rest of the portal reads (lib/academic/). This is the bridge: the new
 * tables carry more columns and different names, and everything downstream
 * — the booking form's parent locking, the warden's family check, the
 * Copy-to chain, the requester-details card — still reads the old shape.
 *
 * One function per table. Each is pure and never throws.
 */
import type {
  StudentRecord,
  EmployeeRecord,
  OfficeRecord,
  StudentRepRecord,
  WardenRecord,
  AcademicRecord,
  AcademicRecordKind,
} from "@/lib/academic/types";
import type {
  InstituteStudent,
  InstituteEmployee,
  InstituteOffice,
  InstituteFCC,
  InstituteWarden,
} from "./types";

export function studentToRecord(s: InstituteStudent): StudentRecord {
  return {
    kind: "student",
    roll_number: s.roll_number,
    name: s.full_name,
    program: s.programme,
    department: s.department,
    email: s.email,
    phone: s.phone,
    father_name: s.father_name,
    mother_name: s.mother_name,
    guardian_name: s.guardian_name,
    hostel: s.hostel,
  };
}

export function employeeToRecord(e: InstituteEmployee): EmployeeRecord {
  return {
    kind: "employee",
    employee_id: e.employee_id,
    name: e.full_name,
    department: e.department,
    employee_type: e.employee_type,
    phone: e.phone,
    email: e.email,
    office_number: e.office_number,
  };
}

export function officeToRecord(o: InstituteOffice): OfficeRecord {
  return {
    kind: "office",
    department: o.office_name,
    email: o.office_email,
    phone: o.phone,
    head_name: o.head_name,
    head_email: o.head_email,
  };
}

export function fccToRecord(f: InstituteFCC): StudentRepRecord {
  return {
    kind: "student_rep",
    representative_type: f.event_or_council ?? f.council_name,
    email: f.council_email,
    phone: null,
    faculty_in_charge_email: f.faculty_advisor_email,
  };
}

export function wardenToRecord(w: InstituteWarden): WardenRecord {
  return {
    kind: "warden",
    name: w.full_name,
    phone: w.warden_phone,
    email: w.warden_email,
    hostel: null,
  };
}

/**
 * Look up one institute record and convert it. Returns null when nothing
 * matches. The `findFn` is one of the store's `find*` methods; the `convert`
 * turns the row into the matching AcademicRecord variant.
 */
export type InstituteToRecord = {
  kind: AcademicRecordKind;
  find: (email: string) => Promise<unknown>;
  convert: (row: unknown) => AcademicRecord;
};
