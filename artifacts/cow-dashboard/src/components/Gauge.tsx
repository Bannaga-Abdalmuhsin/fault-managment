const STC_GREEN = "#00C878";
const STC_ORANGE = "#F59E0B";
const STC_RED = "#EF4444";
const STC_GREY = "#E0D8EE";

interface GaugeProps {
  value: number;       // 0-100
  label?: string;
  size?: number;       // width in px
  showValue?: boolean;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const s = polarToXY(cx, cy, r, startAngle);
  const e = polarToXY(cx, cy, r, endAngle);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

export default function Gauge({ value, label, size = 90, showValue = true }: GaugeProps) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct > 95 ? STC_GREEN : pct > 80 ? STC_ORANGE : STC_RED;

  // Gauge arc spans from -135° to +135° (270° total sweep)
  const START = -135;
  const END = 135;
  const sweep = END - START; // 270°
  const fillEnd = START + (pct / 100) * sweep;

  const w = size;
  const h = size * 0.8;
  const cx = w / 2;
  const cy = h * 0.72;
  const ro = size * 0.38;   // outer radius
  const ri = ro * 0.65;     // inner radius (donut)
  const strokeW = ro - ri;

  // Needle angle
  const needleAngle = START + (pct / 100) * sweep;
  const needleLen = ri - 4;
  const np = polarToXY(cx, cy, needleLen, needleAngle + 90);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: size }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible" }}>
        {/* Background track */}
        <path
          d={arcPath(cx, cy, (ro + ri) / 2, START, END)}
          fill="none"
          stroke={STC_GREY}
          strokeWidth={strokeW}
          strokeLinecap="round"
        />
        {/* Colored fill arc */}
        {pct > 0 && (
          <path
            d={arcPath(cx, cy, (ro + ri) / 2, START, fillEnd)}
            fill="none"
            stroke={color}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )}
        {/* Needle */}
        <line
          x1={cx}
          y1={cy}
          x2={np.x}
          y2={np.y}
          stroke="#333"
          strokeWidth={1.8}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={4} fill="#444" />
        <circle cx={cx} cy={cy} r={2} fill="white" />

        {/* Min / Max labels */}
        {(() => {
          const minP = polarToXY(cx, cy, ro + 6, START + 90);
          const maxP = polarToXY(cx, cy, ro + 6, END + 90);
          return (
            <>
              <text x={minP.x} y={minP.y} fontSize={9} fill="#999" textAnchor="middle" dominantBaseline="middle">0</text>
              <text x={maxP.x} y={maxP.y} fontSize={9} fill="#999" textAnchor="middle" dominantBaseline="middle">100</text>
            </>
          );
        })()}
      </svg>
      {showValue && (
        <div style={{ fontSize: 13, fontWeight: 700, color, marginTop: -6, lineHeight: 1 }}>
          {pct.toFixed(2)}%
        </div>
      )}
      {label && (
        <div style={{ fontSize: 10, color: "#555", textAlign: "center", marginTop: 2, lineHeight: 1.2 }}>
          {label}
        </div>
      )}
    </div>
  );
}
