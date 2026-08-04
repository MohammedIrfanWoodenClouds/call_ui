/** Client-side export helpers — no backend changes. */

export type ExportFormat = "csv" | "xlsx" | "pdf" | "json";

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((r) => r.map(escapeCsv).join(",")),
  ];
  return lines.join("\r\n");
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | boolean | null | undefined)[][]): void {
  const csv = rowsToCsv(headers, rows);
  downloadBlob(filename, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

/** Spreadsheet-friendly CSV with .xlsx extension for Excel open (UTF-8 BOM). */
export function downloadXlsxCompatible(
  filename: string,
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][]
): void {
  const csv = "\uFEFF" + rowsToCsv(headers, rows);
  const name = filename.endsWith(".xlsx") ? filename : filename.replace(/\.csv$/i, "") + ".xlsx";
  downloadBlob(name, new Blob([csv], { type: "application/vnd.ms-excel;charset=utf-8" }));
}

export function downloadJson(filename: string, data: unknown): void {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

export function downloadPdfReport(title: string, lines: string[]): void {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;padding:32px;color:#0f172a}
  h1{font-size:20px;margin:0 0 8px}
  .meta{color:#64748b;font-size:12px;margin-bottom:24px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th,td{border-bottom:1px solid #e2e8f0;padding:8px 6px;text-align:left}
  th{color:#64748b;font-weight:600}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<p class="meta">WC . AI · Generated ${new Date().toLocaleString()}</p>
<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.5">${lines.map(escapeHtml).join("\n")}</pre>
<script>window.onload=()=>window.print()</script>
</body></html>`;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseDelimited(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const delim = lines[0]!.includes("\t") ? "\t" : ",";
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) {
        out.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = parseLine(lines[0]!);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}
