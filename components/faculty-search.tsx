"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import type { ServiceType } from "@/lib/types";

export function FacultySearch({
  facultyMembers,
  service,
}: {
  facultyMembers: { id: string; full_name: string; email: string }[];
  service?: ServiceType;
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
    router.push(`/book?${params.toString()}`);
  };

  return (
    <div className="relative max-w-sm">
      <label htmlFor="faculty-search" className="block text-sm font-medium mb-1">
        Book on behalf of a faculty member
      </label>
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
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded border bg-popover shadow-md"
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
