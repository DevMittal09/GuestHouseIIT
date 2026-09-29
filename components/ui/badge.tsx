import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Tags, GOV.UK-style (30 Sep 2026): square-cornered, sentence case, a solid
 * pale fill with a dark text of the same hue — never a pill. Status colours
 * come from the `tag-*` utilities in `app/globals.css` (see `StatusBadge`).
 */
const badgeVariants = cva(
  "group/badge inline-flex h-auto min-h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-xs border border-transparent px-1.5 py-px text-xs leading-[1.35] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-ink text-white [a]:hover:bg-ink-soft",
        secondary: "bg-band text-ink [a]:hover:bg-border",
        destructive: "tag-red",
        outline: "border-border-strong bg-background text-foreground [a]:hover:bg-band",
        ghost: "text-muted-foreground hover:bg-band",
        link: "text-ink underline underline-offset-4",
        /** No fill of its own: pass one of the `tag-*` utilities as the class. */
        tag: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
