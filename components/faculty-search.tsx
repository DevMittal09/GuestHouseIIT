"use client";

import { type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PencilIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ServiceType } from "@/lib/types";

/**
 * Segmented toggle for non-teaching staff: book for yourself or on behalf of
 * a faculty member. Wraps in a Card and conditionally renders `children` (the
 * booking form) only when "Book for myself" is active or a faculty member has
 * been selected.
 */
export function FacultyBookingToggle({
  current,
  service,
  facultyMembers,
  children,
}: {
  current: string | null;
  service?: ServiceType;
  facultyMembers: { id: string; full_name: string; email: string }[];
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

  const selectedFaculty = current
    ? facultyMembers.find((f) => f.id === current) ?? null
    : null;

  const showSearchBox = onBehalf && (!selectedFaculty || changing);
  const showContent = !onBehalf || !!selectedFaculty;

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

              {/* Selected faculty name with edit icon */}
              {onBehalf && selectedFaculty && !changing && (
                <span className="inline-flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-medium">
                  Booking for {selectedFaculty.full_name}
                  <button
                    type="button"
                    onClick={() => setChanging(true)}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Change faculty"
                    title="Change faculty"
                  >
                    <PencilIcon className="size-3.5" />
                  </button>
                </span>
              )}

              {/* Search box */}
              {showSearchBox && (
                <FacultySearch
                  facultyMembers={facultyMembers}
                  service={service}
                  onSelect={() => setChanging(false)}
                />
              )}
            </div>

            {/* Prompt when on-behalf; invisible placeholder in self mode for consistent Card height */}
            {onBehalf && !selectedFaculty && !changing ? (
              <p className="text-sm text-muted-foreground">
                Search and select a faculty member to continue.
              </p>
            ) : !onBehalf ? (
              <p className="invisible text-sm" aria-hidden="true">
                Search and select a faculty member to continue.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {showContent ? children : null}
    </>
  );
}

function FacultySearch({
  facultyMembers,
  service,
  onSelect,
}: {
  facultyMembers: { id: string; full_name: string; email: string }[];
  service?: ServiceType;
  onSelect?: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = query.trim()
    ? facultyMembers.filter((f) => {
        const q = query.toLowerCase();
        return f.full_name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q);
      })
    : [];

  const select = (id: string) => {
    const params = new URLSearchParams();
    params.set("for_faculty", id);
    if (service) params.set("service", service);
    onSelect?.();
    router.push(`/book?${params.toString()}`);
  };

  return (
    <div className="relative w-full max-w-sm">
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input
          id="faculty-search"
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
          aria-expanded={open && filtered.length > 0}
          aria-controls="faculty-search-list"
        />
      </div>
      {open && query.trim() && (
        <ul
          id="faculty-search-list"
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded border bg-popover shadow-md"
          onMouseDown={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">No faculty found</li>
          ) : (
            filtered.slice(0, 20).map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent"
                  onClick={() => {
                    setOpen(false);
                    setQuery(f.full_name);
                    select(f.id);
                  }}
                >
                  <span className="block font-medium">{f.full_name}</span>
                  <span className="block text-xs text-muted-foreground">{f.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
