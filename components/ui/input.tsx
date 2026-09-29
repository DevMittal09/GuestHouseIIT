import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * A text box (30 Sep 2026): 4px corners, a firm `--border-strong` edge that
 * turns ink on focus with a vermilion ring outside it — the GOV.UK habit of a
 * focus state nobody can miss — and red when invalid.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded border border-input bg-background px-3 py-1 text-base text-foreground transition-colors outline-none file:mr-3 file:inline-flex file:h-7 file:cursor-pointer file:rounded file:border file:border-border-strong file:bg-band file:px-2.5 file:text-sm file:font-semibold file:text-ink placeholder:text-muted-foreground/80 focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-band disabled:opacity-60 aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
