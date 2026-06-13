// Lightweight client-side CSV export. No dependencies — builds a Blob and
// triggers a download. Good enough for admin "Export" actions.

type Column<T> = { header: string; value: (row: T) => string | number | null | undefined };

function escapeCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  // Wrap in quotes and escape embedded quotes if the cell contains a comma,
  // quote, or newline.
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCSV<T>(filename: string, columns: Column<T>[], rows: T[]): void {
  if (typeof window === "undefined") return;

  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(c.value(row))).join(","))
    .join("\n");
  const csv = `${header}\n${body}`;

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
