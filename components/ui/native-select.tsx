import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Styled native <select> — plays nicely with react-hook-form's register().
 * The chevron is drawn by the `select-chevron` class in app/globals.css, so
 * the control stays one element and `register()` still gets the <select>.
 */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "select-chevron h-10 w-full min-w-0 cursor-pointer rounded-md border border-input bg-white px-3 py-1 text-sm shadow-xs transition-[color,border-color,box-shadow] outline-none hover:border-border-strong",
        "focus-visible:border-vermilion focus-visible:ring-4 focus-visible:ring-ring/15",
        "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
        className
      )}
      {...props}
    />
  );
}
