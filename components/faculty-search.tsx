"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PencilIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceType } from "@/lib/types";

type PersonEntry = { id: string; full_name: string; email: string };

/**
 * Segmented toggle for non-teaching staff: book for yourself or on behalf of
 * a faculty member or a configured non-teaching staff target. Wraps in a Card
 * and conditionally renders `children` (the booking form) only when "Book for
 * myself" is active or a target has been selected.
 */
export function FacultyBookingToggle({
  current,
  currentKind = "faculty",
  service,
  facultyMembers,
  staffTargets = [],
  children,
}: {
  current: string | null;
  currentKind?: "faculty" | "staff";
  service?: ServiceType;
  facultyMembers: PersonEntry[];
  staffTargets?: PersonEntry[];
  children?: ReactNode;
}) {
  const [showSearch, setShowSearch] = useState(current !== null);
  const [changing, setChanging] = useState(false);
  const onBehalf = current !== null || showSearch;

  const selfHref = (() => {
    const params = new URLSearchParams();
    if (service) params.set("service", service);
    const query = params.toString();
    return query ? `/book?${query}` : "/book";
  })();

  const selectedFaculty =
    current && currentKind === "faculty"
      ? facultyMembers.find((f) => f.id === current) ?? null
      : null;
  const selectedStaff =
    current && currentKind === "staff"
      ? staffTargets.find((s) => s.id === current) ?? null
      : null;
  const selectedPerson = selectedFaculty ?? selectedStaff;

  const showSearchBox = onBehalf && (!selectedPerson || changing);
  const showContent = !onBehalf || !!selectedPerson;

  return (
    <>
      <Card className="overflow-visible">
        <CardHeader>
          <CardTitle>Booking as</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Segmented toggle */}
              <nav
                aria-label="Booking as"
                className="inline-flex rounded-md border border-border bg-muted p-0.5"
              >
                {onBehalf ? (
                  <Link
                    href={selfHref}
                    onClick={() => {
                      setShowSearch(false);
                      setChanging(false);
                    }}
                    className={cn(
                      "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                      "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Book for myself
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                      "bg-primary text-primary-foreground shadow-sm"
                    )}
                  >
                    Book for myself
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  className={cn(
                    "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors",
                    onBehalf
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Book on behalf
                </button>
              </nav>

              {/* Selected person name with edit icon */}
              {onBehalf && selectedPerson && !changing && (
                <span className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium">
                  Booking for {selectedPerson.full_name}
                  {selectedStaff && (
                    <span className="text-xs text-muted-foreground">(staff)</span>
                  )}
                  <button
                    type="button"
                    onClick={() => setChanging(true)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Change person"
                    title="Change person"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                </span>
              )}

              {/* Search box */}
              {showSearchBox && (
                <OnBehalfSearch
                  facultyMembers={facultyMembers}
                  staffTargets={staffTargets}
                  service={service}
                  onSelect={() => setChanging(false)}
                />
              )}
            </div>

            {/* Prompt when on-behalf; invisible placeholder in self mode for consistent Card height */}
            {onBehalf && !selectedPerson && !changing ? (
              <p className="text-sm text-muted-foreground">
                Search and select a person to continue.
              </p>
            ) : !onBehalf ? (
              <p className="invisible text-sm" aria-hidden="true">
                Search and select a person to continue.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {showContent ? children : null}
    </>
  );
}

function OnBehalfSearch({
  facultyMembers,
  staffTargets,
  service,
  onSelect,
}: {
  facultyMembers: PersonEntry[];
  staffTargets: PersonEntry[];
  service?: ServiceType;
  onSelect?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const q = query.toLowerCase().trim();
  const filteredFaculty = q
    ? facultyMembers.filter(
        (f) => f.full_name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q),
      )
    : [];
  const filteredStaff = q
    ? staffTargets.filter(
        (s) => s.full_name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
      )
    : [];

  const selectFaculty = (id: string) => {
    const params = new URLSearchParams();
    params.set("for_faculty", id);
    if (service) params.set("service", service);
    onSelect?.();
    router.push(`/book?${params.toString()}`);
  };

  const selectStaff = (id: string) => {
    const params = new URLSearchParams();
    params.set("for_staff", id);
    if (service) params.set("service", service);
    onSelect?.();
    router.push(`/book?${params.toString()}`);
  };

  const hasResults = filteredFaculty.length > 0 || filteredStaff.length > 0;

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input
          id="on-behalf-search"
          type="text"
          className="w-full rounded border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && hasResults}
          aria-controls="on-behalf-search-list"
        />
      </div>
      {open && q && (
        <ul
          id="on-behalf-search-list"
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border bg-popover shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {!hasResults ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matches found</li>
          ) : (
            <>
              {filteredFaculty.length > 0 && (
                <>
                  {staffTargets.length > 0 && (
                    <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted">
                      Faculty (official booking only)
                    </li>
                  )}
                  {filteredFaculty.slice(0, 10).map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
                        onClick={() => {
                          setOpen(false);
                          setQuery(f.full_name);
                          selectFaculty(f.id);
                        }}
                      >
                        <span className="block font-medium">{f.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{f.email}</span>
                      </button>
                    </li>
                  ))}
                </>
              )}
              {filteredStaff.length > 0 && (
                <>
                  <li className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted">
                    Non-teaching staff (personal booking only)
                  </li>
                  {filteredStaff.slice(0, 10).map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
                        onClick={() => {
                          setOpen(false);
                          setQuery(s.full_name);
                          selectStaff(s.id);
                        }}
                      >
                        <span className="block font-medium">{s.full_name}</span>
                        <span className="block text-xs text-muted-foreground">{s.email}</span>
                      </button>
                    </li>
                  ))}
                </>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
