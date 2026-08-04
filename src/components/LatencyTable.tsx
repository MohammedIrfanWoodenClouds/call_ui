import type { LatencySnapshot } from "../lib/voiceLatency";

function fmt(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms.toFixed(1)}` : `${(ms / 1000).toFixed(2)}s`;
}

/** Live voice-pipeline latency table (avg / min / max per stage). */
export default function LatencyTable({ latency }: { latency: LatencySnapshot }) {
  const hasData = latency.totalConversation.samples > 0;
  if (!hasData) return null;

  const rows = [
    ...latency.stages,
    latency.totalConversation,
  ];

  return (
    <div className="latency-panel">
      <div className="latency-panel-head">
        <h2>Voice pipeline latency</h2>
        <span className="muted">
          {latency.totalConversation.samples} turn
          {latency.totalConversation.samples === 1 ? "" : "s"} · ms
        </span>
      </div>
      <div className="latency-table-wrap">
        <table className="latency-table">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Average</th>
              <th scope="col">Minimum</th>
              <th scope="col">Maximum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.stage}
                className={
                  row.stage === "Total conversation latency" ? "latency-total" : undefined
                }
              >
                <td>{row.stage}</td>
                <td>{fmt(row.average)}</td>
                <td>{fmt(row.minimum)}</td>
                <td>{fmt(row.maximum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
