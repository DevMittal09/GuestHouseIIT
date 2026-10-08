import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select> - plays nicely with react-hook-form's register().
 * Drawn like `Input`: 4px corners, a firm edge, a vermilion focus ring. The
 * browser keeps its own arrow, which the compact time pickers rely on.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full min-w-0 cursor-pointer rounded border border-input bg-background px-3 py-1 text-sm text-foreground transition-colors outline-none",
        "focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion",
        "disabled:cursor-not-allowed disabled:bg-band disabled:opacity-60 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}
