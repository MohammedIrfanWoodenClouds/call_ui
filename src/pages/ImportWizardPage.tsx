import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { saveEnquiry } from "../lib/enquiryApi";
import { parseDelimited } from "../lib/exportUtils";
import type { AuthOutletContext } from "../layout/RequireAuth";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Page";
import { EmptyState } from "../ui/States";

const TARGET_FIELDS = [
  { key: "skip", label: "— Skip —" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "company", label: "Company" },
  { key: "service", label: "Service" },
  { key: "message", label: "Message" },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

type Step = "upload" | "map" | "preview" | "done";

export default function ImportWizardPage() {
  const { token: _token } = useOutletContext<AuthOutletContext>();
  void _token;
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, TargetKey>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | null) {
    if (!file) return;
    setError(null);
    const name = file.name.toLowerCase();
    if (!name.endsWith(".csv") && !name.endsWith(".tsv") && !name.endsWith(".txt") && !name.endsWith(".xlsx")) {
      setError("Use CSV/TSV (or Excel-exported CSV). Binary XLSX is not parsed offline — export CSV from Excel first.");
      return;
    }
    const text = await file.text();
    const parsed = parseDelimited(text);
    if (!parsed.headers.length) {
      setError("No columns found in file.");
      return;
    }
    setFileName(file.name);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const auto: Record<number, TargetKey> = {};
    parsed.headers.forEach((h, i) => {
      const key = h.toLowerCase().replace(/\s+/g, "");
      if (key.includes("name") && !key.includes("company")) auto[i] = "name";
      else if (key.includes("phone") || key.includes("mobile")) auto[i] = "phone";
      else if (key.includes("email")) auto[i] = "email";
      else if (key.includes("company") || key.includes("org")) auto[i] = "company";
      else if (key.includes("service") || key.includes("interest")) auto[i] = "service";
      else if (key.includes("message") || key.includes("note") || key.includes("requirement")) auto[i] = "message";
      else auto[i] = "skip";
    });
    setMapping(auto);
    setStep("map");
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const mappedCount = useMemo(
    () => Object.values(mapping).filter((v) => v !== "skip").length,
    [mapping]
  );

  async function runImport() {
    setImporting(true);
    setError(null);
    let ok = 0;
    let fail = 0;
    const errors: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const payload: Record<string, string> = {};
      for (const [col, field] of Object.entries(mapping)) {
        if (field === "skip") continue;
        const val = row[Number(col)] ?? "";
        if (val) payload[field] = val;
      }
      if (!payload.phone && !payload.name) {
        fail++;
        errors.push(`Row ${i + 2}: needs name or phone`);
        continue;
      }
      try {
        const res = await saveEnquiry(payload);
        if (res.ok) ok++;
        else {
          fail++;
          errors.push(`Row ${i + 2}: ${res.error || res.need || "rejected"}`);
        }
      } catch (e: any) {
        fail++;
        errors.push(`Row ${i + 2}: ${e?.message || "failed"}`);
      }
    }
    setResult({ ok, fail, errors: errors.slice(0, 20) });
    setImporting(false);
    setStep("done");
  }

  return (
    <div className="ent-page ent-wizard">
      <ol className="ent-steps" aria-label="Import steps">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i) => (
          <li key={s} className={step === s ? "active" : ""}>
            <span>{i + 1}</span> {s}
          </li>
        ))}
      </ol>

      {error && <div className="crm-error-banner">{error}</div>}

      {step === "upload" && (
        <Panel title="Upload file" subtitle="CSV / TSV recommended. For Excel, Save As → CSV.">
          <label className="ent-dropzone">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
              aria-label="Choose import file"
            />
            <strong>Drop a file or click to browse</strong>
            <span className="muted">Columns will be mapped in the next step</span>
          </label>
        </Panel>
      )}

      {step === "map" && (
        <Panel title="Map fields" subtitle={fileName}>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>File column</th>
                  <th>Sample</th>
                  <th>Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={`${h}-${i}`}>
                    <td>{h}</td>
                    <td className="muted">{rows[0]?.[i] || "—"}</td>
                    <td>
                      <select
                        className="admin-input"
                        value={mapping[i] ?? "skip"}
                        onChange={(e) =>
                          setMapping((m) => ({ ...m, [i]: e.target.value as TargetKey }))
                        }
                        aria-label={`Map ${h}`}
                      >
                        {TARGET_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ent-wizard-actions">
            <Button variant="ghost" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button variant="primary" disabled={mappedCount === 0} onClick={() => setStep("preview")}>
              Continue ({rows.length} rows)
            </Button>
          </div>
        </Panel>
      )}

      {step === "preview" && (
        <Panel title="Preview" subtitle="First 5 rows with your mapping">
          {preview.length === 0 ? (
            <EmptyState title="No data rows" description="The file only had a header line." />
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    {TARGET_FIELDS.filter((f) => f.key !== "skip" && Object.values(mapping).includes(f.key)).map(
                      (f) => (
                        <th key={f.key}>{f.label}</th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, ri) => (
                    <tr key={ri}>
                      {TARGET_FIELDS.filter(
                        (f) => f.key !== "skip" && Object.values(mapping).includes(f.key)
                      ).map((f) => {
                        const col = Object.entries(mapping).find(([, v]) => v === f.key)?.[0];
                        return <td key={f.key}>{col != null ? row[Number(col)] || "—" : "—"}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="ent-wizard-actions">
            <Button variant="ghost" onClick={() => setStep("map")}>
              Back
            </Button>
            <Button variant="primary" loading={importing} onClick={() => void runImport()}>
              Import {rows.length} contacts
            </Button>
          </div>
        </Panel>
      )}

      {step === "done" && result && (
        <Panel title="Import complete">
          <p>
            <strong>{result.ok}</strong> imported · <strong>{result.fail}</strong> failed
          </p>
          {result.errors.length > 0 && (
            <ul className="ent-error-list">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="ent-wizard-actions">
            <Button
              onClick={() => {
                setStep("upload");
                setResult(null);
                setRows([]);
                setHeaders([]);
              }}
            >
              Import another
            </Button>
            <Link className="ui-btn ui-btn-primary ui-btn-md" to="/admin/contacts">
              View contacts
            </Link>
          </div>
        </Panel>
      )}
    </div>
  );
}
