import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A native checkbox styled as an on/off switch. Native for the same reason as
 * `NativeSelect`: it works with react-hook-form's `register()` directly, where
 * a Radix switch would need a controller around every field.
 */
export function Switch({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <span className={cn("relative inline-flex h-5 w-9 shrink-0 items-center", className)}>
      <input
        type="checkbox"
        role="switch"
        className="peer absolute inset-0 z-10 m-0 size-full cursor-pointer appearance-none rounded-full opacity-0 disabled:cursor-not-allowed"
        {...props}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full bg-input transition-colors peer-checked:bg-vermilion-deep peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:opacity-50"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4"
      />
    </span>
  );
}
