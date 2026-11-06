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
  office_type: string | null;
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
  "office_type",
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

// ---- Column aliases for header detection ------------------------------------

type ColumnAliases = Record<string, string[]>;

export const KNOWN_STUDENT_COLUMNS: ColumnAliases = {
  email: ["email", "email address", "e-mail", "institute email", "mail"],
  batch_year: ["batch_year", "batch year", "batch", "year_of_admission", "year of admission"],
  roll_number: ["roll_number", "roll number", "roll no", "roll no.", "roll"],
  full_name: ["full_name", "full name", "name", "student name"],
  programme: ["programme", "program", "course"],
  faculty_advisor_guide_name: ["faculty_advisor_guide_name", "faculty advisor", "guide name", "advisor", "faculty advisor guide name"],
  department: ["department", "dept"],
  phone: ["phone", "phone number", "mobile", "contact number"],
  aadhar_number: ["aadhar_number", "aadhar", "aadhaar", "aadhaar number", "aadhar number"],
  father_name: ["father_name", "father name", "father's name"],
  father_aadhar_number: ["father_aadhar_number", "father aadhar", "father aadhaar", "father aadhar number"],
  father_phone_number: ["father_phone_number", "father phone", "father phone number"],
  mother_name: ["mother_name", "mother name", "mother's name"],
  mother_aadhar_number: ["mother_aadhar_number", "mother aadhar", "mother aadhaar", "mother aadhar number"],
  mother_phone_number: ["mother_phone_number", "mother phone", "mother phone number"],
  spouse_name: ["spouse_name", "spouse name", "spouse's name"],
  spouse_aadhar_number: ["spouse_aadhar_number", "spouse aadhar", "spouse aadhaar", "spouse aadhar number"],
  spouse_phone_number: ["spouse_phone_number", "spouse phone", "spouse phone number"],
  guardian_name: ["guardian_name", "guardian name", "guardian's name"],
  guardian_aadhar_number: ["guardian_aadhar_number", "guardian aadhar", "guardian aadhaar", "guardian aadhar number"],
  guardian_phone_number: ["guardian_phone_number", "guardian phone", "guardian phone number"],
  hostel: ["hostel", "hostel_id", "hostel name", "hostel id"],
};

export const KNOWN_EMPLOYEE_COLUMNS: ColumnAliases = {
  email: ["email", "email address", "e-mail", "institute email", "mail"],
  employee_id: ["employee_id", "employee id", "emp id", "emp_id"],
  full_name: ["full_name", "full name", "name", "employee name"],
  department: ["department", "dept"],
  employee_type: ["employee_type", "employee type", "type", "category"],
  designation: ["designation", "post", "position"],
  phone: ["phone", "phone number", "mobile", "contact number"],
  office_number: ["office_number", "office number", "office", "room number"],
  gender: ["gender", "sex"],
};

export const KNOWN_OFFICE_COLUMNS: ColumnAliases = {
  office_email: ["office_email", "office email", "email", "e-mail", "mail"],
  office_name: ["office_name", "office name", "name"],
  office_type: ["office_type", "office type", "office_class", "office class", "class", "type"],
  phone: ["phone", "phone number", "contact"],
  department_head: ["department_head", "department head", "has head"],
  head_name: ["head_name", "head name", "head's name"],
  head_email: ["head_email", "head email", "head's email"],
};

export const KNOWN_FCC_COLUMNS: ColumnAliases = {
  council_email: ["council_email", "council email", "email", "e-mail", "mail"],
  council_name: ["council_name", "council name", "name", "club name"],
  event_or_council: ["event_or_council", "event or council", "type", "kind"],
  faculty_advisor_email: ["faculty_advisor_email", "faculty advisor email", "advisor email", "fa email"],
};

export const KNOWN_HOSTEL_COLUMNS: ColumnAliases = {
  hostel_id: ["hostel_id", "hostel id", "id", "code"],
  hostel_name: ["hostel_name", "hostel name", "name"],
};

export const KNOWN_WARDEN_COLUMNS: ColumnAliases = {
  warden_email: ["warden_email", "warden email", "email", "e-mail", "mail"],
  full_name: ["full_name", "full name", "name", "warden name"],
  warden_phone: ["warden_phone", "warden phone", "phone", "contact"],
  warden_role: ["warden_role", "warden role", "role", "designation"],
  hostel_id: ["hostel_id", "hostel id", "hostel", "hostel name"],
};

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
