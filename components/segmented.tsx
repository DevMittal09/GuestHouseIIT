import { cn } from "@/lib/utils";

/**
 * A segmented control's styles (30 Sep 2026): a hairline box of options
 * with the chosen one filled ink — crisp, high-contrast and shadowless, in
 * place of the pale "pill in a well" the registry ships. Used by the view
 * switchers (Day / Week / Month), the mail outbox filter, the Form Builder's
 * role picker and the console's section list.
 */
export const segmentGroup =
  "inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-border-strong bg-background p-0.5";

export function segment(active: boolean, size: "sm" | "md" = "md") {
  return cn(
    "inline-flex cursor-pointer items-center rounded font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-vermilion",
    size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm",
    active ? "bg-ink text-white" : "text-body hover:bg-band hover:text-ink"
  );
}
