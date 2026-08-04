import type { Enquiry } from "../lib/enquiryApi";
import { requirementsDisplay } from "../lib/enquiryApi";

const CORE_FIELDS = ["service", "name", "phone", "email", "company", "messageEn"] as const;

function Value({ value }: { value: string }) {
  if (!value.trim()) return <span className="ld-empty">—</span>;
  return <span className="ld-text">{value}</span>;
}

function EnquiryTable({ e }: { e: Partial<Enquiry> }) {
  const { primary, original } = requirementsDisplay(e);
  const rows: { label: string; value: string; group: string; key: string }[] = [
    { group: "Enquiry", label: "Service", value: e.service ?? "", key: "service" },
    { group: "Contact", label: "Name", value: e.name ?? "", key: "name" },
    { group: "Contact", label: "Mobile", value: e.phone ?? "", key: "phone" },
    { group: "Contact", label: "Email", value: e.email ?? "", key: "email" },
    { group: "Contact", label: "Company", value: e.company ?? "", key: "company" },
    { group: "Details", label: "Requirements (EN)", value: primary, key: "messageEn" },
  ];
  if (original) {
    rows.push({
      group: "Details",
      label: "Requirements (Original)",
      value: original,
      key: "message",
    });
  }
  let lastGroup = "";
  return (
    <table className="ld-table">
      <tbody>
        {rows.flatMap((row) => {
          const out = [];
          if (row.group !== lastGroup) {
            lastGroup = row.group;
            out.push(
              <tr key={`g-${row.group}`} className="ld-grouprow">
                <td colSpan={2}>{row.group}</td>
              </tr>
            );
          }
          out.push(
            <tr key={row.key} className={String(row.value).trim() ? "filled" : ""}>
              <td className="ld-k">{row.label}</td>
              <td className="ld-v">
                <Value value={String(row.value)} />
              </td>
            </tr>
          );
          return out;
        })}
      </tbody>
    </table>
  );
}

export default function EnquiryCard({
  enquiry,
  recent,
}: {
  enquiry: Partial<Enquiry> | null;
  recent: Enquiry[];
}) {
  const e = enquiry ?? {};
  const { primary } = requirementsDisplay(e);
  const captured = CORE_FIELDS.filter((k) => {
    if (k === "messageEn") return Boolean(primary.trim() || (e.message ?? "").trim());
    return String((e as any)[k] ?? "").trim();
  }).length;
  const pct = Math.round((captured / CORE_FIELDS.length) * 100);
  const done = e.status === "Submitted";

  return (
    <div className="ld">
      <div className="ld-head">
        <div className="ld-avatar">📋</div>
        <div className="ld-id">
          <div className="ld-name">{e.ref || "New enquiry"}</div>
          <div className="ld-sub">{(e.service || "pick a service…") as string}</div>
        </div>
        <span className={`tk-status ${done ? "scheduled" : "draft"}`}>
          {done ? "✓ Submitted" : "Draft"}
        </span>
      </div>

      <div className="ld-progress">
        <div className="ld-progress-track">
          <div className="ld-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="ld-progress-num">
          {captured}/{CORE_FIELDS.length}
        </span>
      </div>

      <EnquiryTable e={e} />

      {recent.length > 0 && (
        <div className="sq">
          <div className="sq-title">Recent enquiries</div>
          {recent.slice(0, 6).map((x) => (
            <div key={x.id} className="sq-row" title={x.name}>
              <span className="sq-icon">📋</span>
              <span className="sq-ref">{x.ref}</span>
              <span className="sq-main">
                {x.service || "Enquiry"}
                {x.name ? ` · ${x.name.split(" ")[0]}` : ""}
              </span>
              <span className="sq-when">{x.company || ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
