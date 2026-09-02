"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A whole-number field you can actually clear and retype.
 *
 * The obvious `value={count} onChange={e => setCount(Number(e.target.value) || 1)}`
 * makes the box impossible to edit: clearing it yields "", `Number("")` is 0,
 * `|| 1` snaps it straight back to 1, and the only way left to change the
 * number is the spinner arrows. So this keeps the **raw string** — including
 * the empty one — and leaves it to the caller's validation to complain about a
 * blank box. Explicit −/+ buttons sit either side for the people who liked the
 * arrows.
 */
export function QuantityInput({
  value,
  onChange,
  min = 0,
  max = 99,
  id,
  className,
  "aria-label": ariaLabel,
  disabled,
}: {
  /** Raw text, "" allowed. */
  value: string;
  onChange: (raw: string) => void;
  min?: number;
  max?: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
  disabled?: boolean;
}) {
  const parsed = value.trim() === "" ? null : Number(value);
  const current = parsed !== null && Number.isFinite(parsed) ? parsed : null;

  const step = (delta: number) => {
    // Stepping from an empty or unparseable box starts at the minimum rather
    // than throwing NaN into the form.
    const next = current === null ? min : current + delta;
    onChange(String(Math.min(Math.max(next, min), max)));
  };

  return (
    <div className={cn("flex items-stretch gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label="Decrease"
        disabled={disabled || (current !== null && current <= min)}
        onClick={() => step(-1)}
      >
        −
      </Button>
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          // Digits only, so the field cannot hold "1e5" or "-2", but an empty
          // box stays empty until the requester types something.
          const next = e.target.value.replace(/[^\d]/g, "");
          onChange(next);
        }}
        className="w-16 text-center tabular-nums"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="shrink-0"
        aria-label="Increase"
        disabled={disabled || (current !== null && current >= max)}
        onClick={() => step(1)}
      >
        +
      </Button>
    </div>
  );
}
