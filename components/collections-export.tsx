"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { exportCollectionsCsv } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The monthly collections report (Phase 5): every invoice issued in a month
 * and every payment received in it, with totals by payment mode and by
 * debitable head, as CSV for the accounts section.
 */
export function CollectionsExport({ defaultMonth }: { defaultMonth: string }) {
  const [month, setMonth] = useState(defaultMonth);
  const [isPending, startTransition] = useTransition();

  const download = () =>
    startTransition(async () => {
      const result = await exportCollectionsCsv(month);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // With a BOM so Excel reads the ₹ and names as UTF-8.
      const blob = new Blob([`﻿${result.csv}`], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(
        result.rows === 0 ? "No invoices that month — the file has the empty summary" : `Exported ${result.rows} invoice${result.rows === 1 ? "" : "s"}`
      );
    });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">Monthly collections</p>
        <p className="text-xs text-muted-foreground">
          Invoices issued and payments received in the month, with totals by payment mode and debitable head.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="collections-month" className="text-xs">
          Month
        </Label>
        <Input
          id="collections-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-40"
        />
      </div>
      <Button variant="outline" onClick={download} disabled={isPending || !month}>
        {isPending ? "Preparing…" : "Download CSV"}
      </Button>
    </div>
  );
}
