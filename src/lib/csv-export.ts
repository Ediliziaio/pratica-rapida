export interface CsvColumn {
  key: string;
  label: string;
  format?: (value: any) => string;
}

export function exportToCSV(
  data: Record<string, any>[],
  filename: string,
  columns: CsvColumn[]
) {
  if (data.length === 0) return;

  const BOM = "\uFEFF";
  const header = columns.map(c => `"${c.label}"`).join(";");
  const rows = data.map(row =>
    columns
      .map(col => {
        const raw = row[col.key];
        const val = col.format ? col.format(raw) : (raw ?? "");
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(";")
  );

  const csv = BOM + [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
