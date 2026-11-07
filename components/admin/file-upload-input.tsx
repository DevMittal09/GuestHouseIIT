"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME,
  FileParseError,
  parseFile,
} from "@/lib/parse-file";

/**
 * A file picker that reads a CSV or XLSX file on the client and hands its
 * content back as CSV text — the same format every paste import already
 * consumes. Used beside the paste textarea in every bulk import dialog.
 */
export function FileUploadInput({
  onLoaded,
  disabled,
}: {
  onLoaded: (text: string, fileName: string) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    try {
      const csv = await parseFile(file);
      setFileName(file.name);
      onLoaded(csv, file.name);
    } catch (e) {
      const message =
        e instanceof FileParseError ? e.message : "Could not read the file";
      toast.error(message);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept={`${ACCEPTED_EXTENSIONS},${ACCEPTED_MIME}`}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => fileRef.current?.click()}
      >
        Choose .csv or .xlsx file
      </Button>
      {fileName && (
        <span className="text-sm text-muted-foreground">{fileName}</span>
      )}
    </div>
  );
}
