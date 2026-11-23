import { describe, expect, it } from "vitest";
import {
  facultyBookableBy,
  isFacultyMember,
  isNonTeachingStaff,
  raisedByStaffForFaculty,
} from "@/lib/staff-booking";
import { profile } from "./helpers";

describe("isNonTeachingStaff", () => {
  it("returns true for non-teaching staff", () => {
    expect(isNonTeachingStaff(profile({ role: "employee", staff_category: "staff" }))).toBe(true);
  });

  it("returns false for faculty", () => {
    expect(isNonTeachingStaff(profile({ role: "employee", staff_category: "faculty" }))).toBe(false);
  });

  it("returns false for students", () => {
    expect(isNonTeachingStaff(profile({ role: "student" }))).toBe(false);
  });

  it("returns false for employee with no staff_category", () => {
    expect(isNonTeachingStaff(profile({ role: "employee", staff_category: null }))).toBe(false);
  });
});

describe("isFacultyMember", () => {
  it("returns true for faculty", () => {
    expect(isFacultyMember(profile({ role: "employee", staff_category: "faculty" }))).toBe(true);
  });

  it("returns true for employee with null staff_category", () => {
    expect(isFacultyMember(profile({ role: "employee", staff_category: null }))).toBe(true);
  });

  it("returns false for non-teaching staff", () => {
    expect(isFacultyMember(profile({ role: "employee", staff_category: "staff" }))).toBe(false);
  });

  it("returns false for students", () => {
    expect(isFacultyMember(profile({ role: "student" }))).toBe(false);
  });
});

describe("facultyBookableBy", () => {
  const staff = profile({ id: "s-1", role: "employee", staff_category: "staff" });
  const faculty1 = profile({ id: "f-1", role: "employee", staff_category: "faculty", full_name: "Alice Prof" });
  const faculty2 = profile({ id: "f-2", role: "employee", staff_category: "faculty", full_name: "Bob Prof" });
  const student = profile({ id: "st-1", role: "student" });
  const otherStaff = profile({ id: "s-2", role: "employee", staff_category: "staff", full_name: "Eve Staff" });

  it("returns all faculty for non-teaching staff", () => {
    const result = facultyBookableBy(staff, [staff, faculty1, faculty2, student, otherStaff]);
    expect(result.map((p) => p.id)).toEqual(["f-1", "f-2"]);
  });

  it("sorts by name", () => {
    const result = facultyBookableBy(staff, [faculty2, faculty1]);
    expect(result[0].full_name).toBe("Alice Prof");
    expect(result[1].full_name).toBe("Bob Prof");
  });

  it("excludes the user themselves", () => {
    // staff member has same id as a faculty entry — should be excluded
    const selfStaff = profile({ id: "f-1", role: "employee", staff_category: "staff" });
    const result = facultyBookableBy(selfStaff, [faculty1]);
    expect(result).toHaveLength(0);
    // but a different faculty member is included
    const result2 = facultyBookableBy(selfStaff, [faculty1, faculty2]);
    expect(result2).toHaveLength(1);
    expect(result2[0].id).toBe("f-2");
  });

  it("returns empty for faculty", () => {
    expect(facultyBookableBy(faculty1, [faculty2, staff])).toEqual([]);
  });

  it("returns empty for students", () => {
    expect(facultyBookableBy(student, [faculty1, faculty2])).toEqual([]);
  });
});

describe("raisedByStaffForFaculty", () => {
  it("detects a staff-for-faculty booking", () => {
    expect(
      raisedByStaffForFaculty({ user_role: "employee", user_id: "f-1", created_by: "s-1" }),
    ).toBe(true);
  });

  it("rejects a self-booking", () => {
    expect(
      raisedByStaffForFaculty({ user_role: "employee", user_id: "f-1", created_by: "f-1" }),
    ).toBe(false);
  });

  it("rejects a booking with no created_by", () => {
    expect(
      raisedByStaffForFaculty({ user_role: "employee", user_id: "f-1", created_by: null }),
    ).toBe(false);
  });

  it("rejects a club booking", () => {
    expect(
      raisedByStaffForFaculty({ user_role: "club", user_id: "c-1", created_by: "f-1" }),
    ).toBe(false);
  });
});
