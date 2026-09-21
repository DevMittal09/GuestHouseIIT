"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type NavItem = { href: string; label: string };

/**
 * Whether `href` is the current page. `exact` items only light up on their own
 * path (`/`); the rest also cover their sub-pages.
 */
function useIsActive(exact: string[]) {
  const pathname = usePathname();
  return (href: string) =>
    exact.includes(href) ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** The header's inline links on wide screens, with a vermilion bar under the current page. */
export function NavLinks({
  items,
  label,
  exact = ["/"],
  className,
}: {
  items: NavItem[];
  label: string;
  exact?: string[];
  className?: string;
}) {
  const isActive = useIsActive(exact);
  return (
    <nav aria-label={label} className={className}>
      <ul className="flex items-center gap-1">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative block rounded-full px-3.5 py-2 text-[14px] font-semibold transition-colors duration-150",
                  active
                    ? "text-foreground"
                    : "text-body hover:bg-band hover:text-foreground"
                )}
              >
                {item.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3.5 -bottom-0.5 h-[3px] rounded-full bg-gradient-to-r from-vermilion to-saffron"
                  />
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same links as a slide-over panel below the wide breakpoint. Built on the
 * Radix dialog, so focus is trapped while it is open, Escape closes it, and
 * focus returns to the menu button afterwards.
 */
export function MobileMenu({
  items,
  exact = ["/"],
  actions,
  className,
}: {
  items: NavItem[];
  exact?: string[];
  /** Sign in / portal and the booking call to action, at the foot of the panel. */
  actions: { href: string; label: string; primary?: boolean }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const isActive = useIsActive(exact);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className={cn(
          "inline-flex size-11 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-foreground transition-colors hover:bg-band",
          className
        )}
      >
        <Menu aria-hidden className="size-5" />
        <span className="sr-only">Open menu</span>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(88vw,380px)] flex-col overflow-y-auto bg-ink text-white shadow-lift outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <div className="flex items-center justify-between border-b border-ink-line px-6 py-5">
            <DialogPrimitive.Title className="font-heading text-xl font-semibold">
              Guest House
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
              <X aria-hidden className="size-5" />
              <span className="sr-only">Close menu</span>
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Main" className="flex-1 px-4 py-4">
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center justify-between rounded-xl px-4 py-3.5 font-heading text-[22px] font-medium transition-colors",
                        active ? "bg-white/10 text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {item.label}
                      {active && <span aria-hidden className="size-2 rounded-full bg-saffron" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="flex flex-col gap-3 border-t border-ink-line px-6 py-6">
            {actions.map((action) => (
              <Link
                key={action.href + action.label}
                href={action.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition-colors",
                  action.primary
                    ? "bg-vermilion-deep text-white hover:bg-vermilion-hover"
                    : "border border-white/25 text-white hover:bg-white/10"
                )}
              >
                {action.label}
                {action.primary && <ArrowUpRight aria-hidden className="size-4" />}
              </Link>
            ))}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
