interface GaugeProps { value: number; size?: number; }

// Standard-math angle → SVG x/y (y-axis flipped)
function pt(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// Arc segment on the TOP semicircle (sweep-flag=0 = CCW in SVG = goes UP)
function arc(cx: number, cy: number, rm: number, a1: number, a2: number) {
  const s = pt(cx, cy, rm, a1);
  const e = pt(cx, cy, rm, a2);
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${rm} ${rm} 0 0 0 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export default function Gauge({ value, size = 190 }: GaugeProps) {
  const pct   = Math.min(100, Math.max(0, value));
  const color = pct >= 95 ? "#00C878" : pct >= 80 ? "#F59E0B" : "#EF4444";

  // Arc geometry — center (cx,cy) at bottom, arc sweeps 180°→0° through top
  const w    = size;
  const rO   = size * 0.42;
  const sw   = size * 0.12;
  const rm   = rO - sw / 2;
  const hubR = size * 0.048;
  // Viewbox: top-half of arc (height = rO) + hub + label area below
  const arcH  = rO + hubR + 3;
  const textH = size * 0.22;   // space below arc for value + sub-label
  const h     = arcH + textH;
  const cx    = w / 2;
  const cy    = arcH - hubR - 2;

  // Needle: 0%→left(180°), 100%→right(0°)
  const deg     = 180 - (pct / 100) * 180;
  const needleR = rm - 4;
  const baseW   = hubR * 0.55;
  const tip     = pt(cx, cy, needleR, deg);
  const bl      = pt(cx, cy, baseW, deg + 90);
  const br      = pt(cx, cy, baseW, deg - 90);

  // Tick dashes at 0%, 50%, 100%
  const ticks = [
    { a: 180, lbl: "0%",   ax: "end" as const,    dx: -8 },
    { a: 90,  lbl: "50%",  ax: "middle" as const,  dx: 0  },
    { a: 0,   lbl: "100%", ax: "start" as const,   dx: 8  },
  ];

  const valFontSize = size * 0.155;
  const subFontSize = size * 0.068;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {/* Gray background track */}
      <path d={arc(cx, cy, rm, 180, 0)}
        fill="none" stroke="rgba(255,255,255,0.10)"
        strokeWidth={sw} strokeLinecap="butt" />

      {/* Red zone 180°→120° */}
      <path d={arc(cx, cy, rm, 180, 120)}
        fill="none" stroke="#EF4444" strokeWidth={sw} strokeLinecap="butt" />

      {/* Orange zone 120°→60° */}
      <path d={arc(cx, cy, rm, 120, 60)}
        fill="none" stroke="#F59E0B" strokeWidth={sw} strokeLinecap="butt" />

      {/* Green zone 60°→0° */}
      <path d={arc(cx, cy, rm, 60, 0)}
        fill="none" stroke="#00C878" strokeWidth={sw} strokeLinecap="butt" />

      {/* Tick dashes + labels */}
      {ticks.map(({ a, lbl, ax, dx }) => {
        const inner = pt(cx, cy, rO,     a);
        const outer = pt(cx, cy, rO + 7, a);
        const lblPt = pt(cx, cy, rO + 16, a);
        return (
          <g key={a}>
            <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
              stroke="rgba(255,255,255,0.55)" strokeWidth={1.8} />
            <text x={lblPt.x + dx} y={lblPt.y}
              fontSize={subFontSize * 0.88}
              fill="rgba(255,255,255,0.55)"
              textAnchor={ax} dominantBaseline="middle" fontWeight="700">
              {lbl}
            </text>
          </g>
        );
      })}

      {/* Needle */}
      <polygon
        points={`${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${bl.x.toFixed(2)},${bl.y.toFixed(2)} ${br.x.toFixed(2)},${br.y.toFixed(2)}`}
        fill="rgba(255,255,255,0.95)"
        filter="url(#needleShadow)"
      />
      <defs>
        <filter id="needleShadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.65)" />
        </filter>
      </defs>

      {/* Hub */}
      <circle cx={cx} cy={cy} r={hubR}
        fill="rgba(40,0,70,0.92)" stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={hubR * 0.38} fill="#fff" />

      {/* Value text */}
      <text
        x={cx} y={arcH + textH * 0.38}
        fontSize={valFontSize} fontWeight="900" fill={color}
        textAnchor="middle" dominantBaseline="middle"
        style={{ filter: `drop-shadow(0 0 6px ${color}88)` }}>
        {pct.toFixed(1)}%
      </text>

      {/* Sub-label */}
      <text
        x={cx} y={arcH + textH * 0.78}
        fontSize={subFontSize} fontWeight="700" fill="rgba(200,160,255,0.60)"
        textAnchor="middle" dominantBaseline="middle"
        letterSpacing="1.5">
        AVAILABILITY
      </text>
    </svg>
  );
}
