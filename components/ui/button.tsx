import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Buttons, in the portal's institutional register (30 Sep 2026): 6px
 * corners, solid fills or a hairline outline, no shadow, and a vermilion
 * focus ring drawn outside the button so it is visible on every fill.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors duration-150 outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-vermilion active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-ink-soft",
        // The institute's vermilion, for the one call to action on a page
        // (New booking, Submit). Deep vermilion, because white on the bright
        // one is 3.8:1.
        brand: "bg-vermilion-deep text-white hover:bg-vermilion-hover",
        // The desk's two lifecycle steps (stays table, checking out today).
        // Deliberately unlike each other and unlike the ink default.
        occupy: "bg-occupy text-white hover:bg-occupy-hover",
        vacate: "bg-vacate text-white hover:bg-vacate-hover",
        outline:
          "border-border-strong bg-background text-foreground hover:border-ink hover:bg-band aria-expanded:bg-band",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_7%)] aria-expanded:bg-secondary",
        ghost:
          "text-foreground hover:bg-band aria-expanded:bg-band",
        destructive:
          "border-destructive/40 bg-background text-destructive hover:border-destructive hover:bg-destructive hover:text-white",
        link: "text-ink underline decoration-vermilion decoration-2 underline-offset-4 hover:text-vermilion-deep",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 rounded px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded px-3 text-[0.8125rem] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-[0.9375rem] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
