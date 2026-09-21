"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  BedDouble,
  CalendarPlus,
  CalendarRange,
  ClipboardCheck,
  ConciergeBell,
  Globe,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Stamp,
  X,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import { cn, initials } from "@/lib/utils";

export type PortalNavItem = {
  href: string;
  label: string;
  /** The path prefix the item lights up for, when wider than `href`. */
  match?: string;
};
export type PortalUser = { name: string; email: string; roleLabel: string };

/**
 * Icons by route. They live here rather than travelling with the items,
 * because the items are built in the server layout and a component cannot be
 * passed across to the client.
 */
const ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/book": CalendarPlus,
  "/warden": ClipboardCheck,
  "/fa": ClipboardCheck,
  "/iar": ClipboardCheck,
  "/approvals": Stamp,
  "/admin/users": Settings2,
  "/manager": BedDouble,
  "/caretaker": ConciergeBell,
  "/admin": Settings2,
  "/availability": CalendarRange,
  "/history": History,
};

function SidebarContent({
  items,
  user,
  homeHref,
  onNavigate,
}: {
  items: PortalNavItem[];
  user: PortalUser;
  homeHref: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden">
      <div aria-hidden className="emblem-watermark absolute -right-28 -bottom-24 -z-10 size-80 opacity-[0.05]" />
      <Link
        href={homeHref}
        onClick={onNavigate}
        className="flex items-center gap-3 px-6 pt-6 pb-7"
      >
        <Image src="/iitpkd-logo.png" alt="" width={40} height={40} className="size-10" />
        <span className="leading-tight">
          <span className="block font-heading text-[20px] font-semibold text-white">Guest House</span>
          <span className="block text-[10.5px] font-bold tracking-[0.18em] text-white/45 uppercase">
            IIT Palakkad · Portal
          </span>
        </span>
      </Link>

      <nav aria-label="Portal" className="flex-1 overflow-y-auto px-4">
        <p className="mb-2 px-3 text-[10.5px] font-bold tracking-[0.18em] text-white/35 uppercase">Menu</p>
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const Icon = ICONS[item.href] ?? LayoutDashboard;
            const active = isActive(item.match ?? item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vermilion",
                    active
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/5 hover:text-white"
                  )}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-2.5 bottom-2.5 -left-4 w-1 rounded-r-full bg-gradient-to-b from-saffron to-vermilion"
                    />
                  )}
                  <Icon
                    aria-hidden
                    className={cn(
                      "size-[18px] shrink-0 transition-colors",
                      active ? "text-saffron" : "text-white/45 group-hover:text-white/80"
                    )}
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-3 px-4 pt-4 pb-5">
        <Link
          href="/"
          onClick={onNavigate}
          className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold text-white/55 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Globe aria-hidden className="size-4" />
          Guest house website
        </Link>
        <div className="flex items-center gap-3 rounded-2xl border border-ink-line bg-white/[0.04] p-3">
          <span
            aria-hidden
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-saffron to-vermilion font-heading text-[14px] font-bold text-ink"
          >
            {initials(user.name)}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13.5px] font-semibold text-white">{user.name}</span>
            <span className="block truncate text-[12px] text-white/50" title={user.email}>
              {user.roleLabel}
            </span>
          </span>
          <form action={logout}>
            <button
              type="submit"
              title="Switch user"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-vermilion"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="sr-only">Switch user</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/** The fixed ink sidebar on wide screens. */
export function PortalSidebar(props: { items: PortalNavItem[]; user: PortalUser; homeHref: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] bg-ink lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}

/**
 * The same sidebar as a slide-over drawer below the wide breakpoint, on the
 * Radix dialog so focus is trapped and Escape closes it.
 */
export function PortalMobileNav(props: { items: PortalNavItem[]; user: PortalUser; homeHref: string }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger className="inline-flex size-10 cursor-pointer items-center justify-center rounded-xl border border-border bg-white text-foreground shadow-xs transition-colors hover:bg-band lg:hidden">
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 left-0 z-50 w-[min(86vw,300px)] bg-ink shadow-lift outline-none data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left"
        >
          <DialogPrimitive.Title className="sr-only">Portal menu</DialogPrimitive.Title>
          <DialogPrimitive.Close className="absolute top-6 right-4 z-10 inline-flex size-9 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20">
            <X aria-hidden className="size-4" />
            <span className="sr-only">Close menu</span>
          </DialogPrimitive.Close>
          <SidebarContent {...props} onNavigate={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
