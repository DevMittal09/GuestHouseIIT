/**
 * Institute data tables - the real records the office keeps for students,
 * employees, offices, fests/councils/clubs, hostels and wardens.
 *
 * These replace the flat `academic_records` bag with proper per-kind tables
 * whose columns match the institute's own spreadsheets (2 Nov 2026).
 *
 * Aadhar numbers are stored encrypted at rest (`lib/crypto.ts`), matching the
 * pattern `booking_guests` already uses for ID documents.
 */

// ---- Students --------------------------------------------------------------

export type InstituteStudent = {
  id: string;
  email: string;
  batch_year: string | null;
  roll_number: string | null;
  full_name: string | null;
  programme: string | null;
  faculty_advisor_guide_name: string | null;
  department: string | null;
  year_of_admission: string | null;
  phone: string | null;
  aadhar_number: string | null;
  father_name: string | null;
  father_aadhar_number: string | null;
  father_phone_number: string | null;
  mother_name: string | null;
  mother_aadhar_number: string | null;
  mother_phone_number: string | null;
  spouse_name: string | null;
  spouse_aadhar_number: string | null;
  spouse_phone_number: string | null;
  guardian_name: string | null;
  guardian_aadhar_number: string | null;
  guardian_phone_number: string | null;
  hostel: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewStudentInput = Omit<InstituteStudent, "id" | "created_at" | "updated_at">;

export const STUDENT_COLUMNS = [
  "email",
  "batch_year",
  "roll_number",
  "full_name",
  "programme",
  "faculty_advisor_guide_name",
  "department",
  "year_of_admission",
  "phone",
  "aadhar_number",
  "father_name",
  "father_aadhar_number",
  "father_phone_number",
  "mother_name",
  "mother_aadhar_number",
  "mother_phone_number",
  "spouse_name",
  "spouse_aadhar_number",
  "spouse_phone_number",
  "guardian_name",
  "guardian_aadhar_number",
  "guardian_phone_number",
  "hostel",
] as const;

// ---- Employees -------------------------------------------------------------

export type InstituteEmployee = {
  id: string;
  email: string;
  employee_id: string | null;
  full_name: string | null;
  department: string | null;
  employee_type: string | null;
  designation: string | null;
  phone: string | null;
  office_number: string | null;
  gender: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewEmployeeInput = Omit<InstituteEmployee, "id" | "created_at" | "updated_at">;

export const EMPLOYEE_COLUMNS = [
  "email",
  "employee_id",
  "full_name",
  "department",
  "employee_type",
  "designation",
  "phone",
  "office_number",
  "gender",
] as const;

// ---- Offices ---------------------------------------------------------------

export type InstituteOffice = {
  id: string;
  office_email: string;
  office_name: string | null;
  office_class: string | null;
  phone: string | null;
  department_head: string | null;
  head_name: string | null;
  head_email: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewOfficeInput = Omit<InstituteOffice, "id" | "created_at" | "updated_at">;

export const OFFICE_COLUMNS = [
  "office_email",
  "office_name",
  "office_class",
  "phone",
  "department_head",
  "head_name",
  "head_email",
] as const;

// ---- Fests / Councils / Clubs ----------------------------------------------

export type InstituteFCC = {
  id: string;
  council_email: string;
  council_name: string | null;
  event_or_council: string | null;
  faculty_advisor_email: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewFCCInput = Omit<InstituteFCC, "id" | "created_at" | "updated_at">;

export const FCC_COLUMNS = [
  "council_email",
  "council_name",
  "event_or_council",
  "faculty_advisor_email",
] as const;

// ---- Institute Hostels (extended) ------------------------------------------

export type InstituteHostel = {
  id: string;
  hostel_id: string;
  hostel_name: string;
  created_at: string;
  updated_at: string;
};

export type NewHostelInput = Omit<InstituteHostel, "id" | "created_at" | "updated_at">;

export const HOSTEL_COLUMNS = [
  "hostel_id",
  "hostel_name",
] as const;

// ---- Wardens ---------------------------------------------------------------

export type InstituteWarden = {
  id: string;
  warden_email: string;
  full_name: string | null;
  warden_phone: string | null;
  warden_role: string | null;
  hostel_id: string | null;
  imported_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NewWardenInput = Omit<InstituteWarden, "id" | "created_at" | "updated_at">;

export const WARDEN_COLUMNS = [
  "warden_email",
  "full_name",
  "warden_phone",
  "warden_role",
  "hostel_id",
] as const;

// ---- Table kind enum -------------------------------------------------------

export type InstituteTableKind =
  | "student"
  | "employee"
  | "office"
  | "fcc"
  | "hostel"
  | "warden";

export const INSTITUTE_TABLE_LABELS: Record<InstituteTableKind, string> = {
  student: "Students",
  employee: "Employees",
  office: "Offices",
  fcc: "Fests, Councils & Clubs",
  hostel: "Hostels",
  warden: "Wardens",
};
