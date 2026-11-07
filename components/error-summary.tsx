"use client";

import { useEffect, useRef } from "react";
import type { FormProblem } from "@/lib/form-problems";

export type ShownProblem = FormProblem & {
  /** The question's selector if it was on screen when the form was checked. */
  target: string | null;
};

/**
 * GOV.UK's error summary: every problem with the submission, at the top of
 * the form, each a link to its question where the question is on screen and
 * plain words where it is not (`lib/form-problems.ts`). It takes focus when
 * it appears, so a screen reader announces it and the page scrolls to it.
 */
export function ErrorSummary({ problems }: { problems: ShownProblem[] }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (problems.length === 0) return;
    box.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    box.current?.focus({ preventScroll: true });
  }, [problems]);

  if (problems.length === 0) return null;

  const go = (selector: string) => {
    const el = document.querySelector<HTMLElement>(selector);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus({ preventScroll: true });
  };

  return (
    <div
      ref={box}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      data-testid="error-summary"
      className="rounded-lg border-4 border-destructive bg-background p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h2 id="error-summary-title" className="text-card font-semibold text-foreground">
        There is a problem
      </h2>
      <ul className="mt-3 space-y-1.5">
        {problems.map((p, i) => (
          <li key={`${p.path ?? ""}-${i}`} className="text-sm font-semibold text-destructive">
            {p.target ? (
              <a
                href={`#${p.path ?? ""}`}
                onClick={(e) => {
                  e.preventDefault();
                  go(p.target!);
                }}
                className="underline underline-offset-2 hover:no-underline"
              >
                {p.message}
              </a>
            ) : (
              p.message
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
