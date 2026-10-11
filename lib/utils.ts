import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * The project's five named type steps (`--text-*` in `app/globals.css`).
 *
 * tailwind-merge has to be told about them. It classifies an unknown
 * `text-<word>` as a **colour**, so `cn("text-title", "text-ink")` dropped
 * `text-title` as the losing half of a colour conflict and the heading came
 * out at 16px - which is how three section headings on the home page silently
 * lost their size the first time these steps were used.
 */
const TYPE_STEPS = ["display", "title", "section", "card", "meta"] as const

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_STEPS] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
