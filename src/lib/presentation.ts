export const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export function searchText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-MX").trim();
}

/** Never let free-form CRM text become a spreadsheet formula. */
export function csvCell(value: unknown): string {
  let content = value == null ? "" : String(value);
  if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+@-]/.test(content)) content = `'${content}`;
  return `"${content.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: unknown[][]): string {
  return "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const url = URL.createObjectURL(new Blob([buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
