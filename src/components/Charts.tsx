/** Lightweight SVG chart widgets — no chart library. */

export function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "#3B82F6",
  fill = "rgba(59, 130, 246, 0.12)",
}: {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
}) {
  const pts = values.length ? values : [0];
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const span = Math.max(max - min, 1);
  const step = pts.length > 1 ? width / (pts.length - 1) : width;
  const coords = pts.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const line = coords.join(" ");
  const area = `0,${height} ${line} ${width},${height}`;

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polygon points={area} fill={fill} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function DualLineChart({
  seriesA,
  seriesB,
  labels,
  width = 560,
  height = 220,
}: {
  seriesA: number[];
  seriesB: number[];
  labels: string[];
  width?: number;
  height?: number;
}) {
  const pad = { t: 16, r: 12, b: 28, l: 32 };
  const w = width - pad.l - pad.r;
  const h = height - pad.t - pad.b;
  const n = Math.max(seriesA.length, seriesB.length, 1);
  const max = Math.max(...seriesA, ...seriesB, 1);
  const xAt = (i: number) => pad.l + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const yAt = (v: number) => pad.t + h - (v / max) * h;

  function path(vals: number[]) {
    return vals
      .map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`)
      .join(" ");
  }

  const areaA = (() => {
    if (!seriesA.length) return "";
    const top = seriesA.map((v, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(v)}`).join(" ");
    return `${top} L${xAt(seriesA.length - 1)},${pad.t + h} L${xAt(0)},${pad.t + h} Z`;
  })();

  return (
    <svg className="dual-line" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = pad.t + h * (1 - t);
        return (
          <line key={t} x1={pad.l} x2={pad.l + w} y1={y} y2={y} stroke="#E5E7EB" strokeWidth="1" />
        );
      })}
      {areaA && <path d={areaA} fill="rgba(59, 130, 246, 0.12)" />}
      <path d={path(seriesA)} fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinejoin="round" />
      <path
        d={path(seriesB)}
        fill="none"
        stroke="#F87171"
        strokeWidth="2"
        strokeDasharray="5 4"
        strokeLinejoin="round"
      />
      {labels.map((lab, i) => (
        <text key={lab + i} x={xAt(i)} y={height - 8} textAnchor="middle" className="chart-axis-label">
          {lab.slice(5)}
        </text>
      ))}
    </svg>
  );
}

const DONUT_COLORS = ["#22C55E", "#F59E0B", "#3B82F6", "#94A3B8"];

export function DonutChart({
  segments,
  size = 180,
}: {
  segments: { label: string; value: number }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EEF2F7" strokeWidth="18" />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * c;
          const el = (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="18"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
        <text x="50%" y="48%" textAnchor="middle" className="donut-center-label">
          SERVICES
        </text>
        <text x="50%" y="58%" textAnchor="middle" className="donut-center-sub">
          Mix
        </text>
      </svg>
      <ul className="donut-legend">
        {segments.map((seg, i) => (
          <li key={seg.label}>
            <span className="donut-swatch" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            <span>{seg.label}</span>
            <strong>{Math.round((seg.value / total) * 100)}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function pctChange(current: number, previous: number): { text: string; up: boolean | null } {
  if (previous === 0 && current === 0) return { text: "0%", up: null };
  if (previous === 0) return { text: "+100%", up: true };
  const p = Math.round(((current - previous) / previous) * 100);
  return { text: `${p > 0 ? "+" : ""}${p}%`, up: p === 0 ? null : p > 0 };
}
