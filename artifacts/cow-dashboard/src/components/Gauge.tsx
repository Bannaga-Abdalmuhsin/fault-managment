interface GaugeProps { value: number; size?: number; }

// Standard-math angle (0=right, 90=up) → SVG x/y (y-axis flipped)
function pt(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

// Top-semicircle arc segment: sweep=1 = CLOCKWISE in SVG = goes UP from left to right
function arc(cx: number, cy: number, rm: number, a1: number, a2: number) {
  const s = pt(cx, cy, rm, a1);
  const e = pt(cx, cy, rm, a2);
  // large=0 (all zones ≤ 180°), sweep=1 = clockwise in SVG = top arc ✓
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${rm} ${rm} 0 0 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

export default function Gauge({ value, size = 190 }: GaugeProps) {
  const pct   = Math.min(100, Math.max(0, value));
  const color = pct >= 95 ? "#00C878" : pct >= 80 ? "#F59E0B" : "#EF4444";

  // Geometry: center (cx,cy) at bottom; arc sweeps 180°→0° through TOP
  const w    = size;
  const rO   = size * 0.42;
  const sw   = size * 0.13;
  const rm   = rO - sw / 2;
  const hubR = size * 0.05;
  const arcH = rO + hubR + 4;
  const textH = size * 0.24;
  const h    = arcH + textH;
  const cx   = w / 2;
  const cy   = arcH - hubR - 2;

  // Needle: 0% → 180° (left), 100% → 0° (right)
  const deg     = 180 - (pct / 100) * 180;
  const needleR = rm - 4;
  const baseW   = hubR * 0.6;
  const tip = pt(cx, cy, needleR, deg);
  const bl  = pt(cx, cy, baseW, deg + 90);
  const br  = pt(cx, cy, baseW, deg - 90);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <defs>
        <filter id="ns" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(0,0,0,0.7)" />
        </filter>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Background track (full 180° top arc) */}
      <path d={arc(cx, cy, rm, 180, 0)}
        fill="none" stroke="rgba(255,255,255,0.10)"
        strokeWidth={sw} strokeLinecap="butt" />

      {/* Red zone: 180°→120° */}
      <path d={arc(cx, cy, rm, 180, 120)}
        fill="none" stroke="#EF4444" strokeWidth={sw} strokeLinecap="butt" />

      {/* Orange zone: 120°→60° */}
      <path d={arc(cx, cy, rm, 120, 60)}
        fill="none" stroke="#F59E0B" strokeWidth={sw} strokeLinecap="butt" />

      {/* Green zone: 60°→0° */}
      <path d={arc(cx, cy, rm, 60, 0)}
        fill="none" stroke="#00C878" strokeWidth={sw} strokeLinecap="butt" />

      {/* Tick marks at 0%, 50%, 100% */}
      {[{ a: 180 }, { a: 90 }, { a: 0 }].map(({ a }) => {
        const i = pt(cx, cy, rO, a);
        const o = pt(cx, cy, rO + 7, a);
        return <line key={a} x1={i.x} y1={i.y} x2={o.x} y2={o.y}
          stroke="rgba(255,255,255,0.6)" strokeWidth={2} />;
      })}

      {/* Needle */}
      <polygon
        points={`${tip.x.toFixed(2)},${tip.y.toFixed(2)} ${bl.x.toFixed(2)},${bl.y.toFixed(2)} ${br.x.toFixed(2)},${br.y.toFixed(2)}`}
        fill="rgba(255,255,255,0.95)" filter="url(#ns)"
      />

      {/* Hub */}
      <circle cx={cx} cy={cy} r={hubR}
        fill="rgba(30,0,60,0.95)" stroke="rgba(255,255,255,0.5)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={hubR * 0.4} fill="#fff" />

      {/* 0% / 100% labels */}
      <text x={cx - rO + 2} y={cy + 14}
        fontSize={size * 0.07} fill="rgba(255,255,255,0.5)"
        textAnchor="middle" dominantBaseline="hanging" fontWeight="700">0%</text>
      <text x={cx + rO - 2} y={cy + 14}
        fontSize={size * 0.07} fill="rgba(255,255,255,0.5)"
        textAnchor="middle" dominantBaseline="hanging" fontWeight="700">100%</text>

      {/* Big value */}
      <text x={cx} y={arcH + textH * 0.36}
        fontSize={size * 0.165} fontWeight="900" fill={color}
        textAnchor="middle" dominantBaseline="middle" filter="url(#glow)">
        {pct.toFixed(1)}%
      </text>

      {/* Sub-label */}
      <text x={cx} y={arcH + textH * 0.76}
        fontSize={size * 0.072} fontWeight="700"
        fill="rgba(190,140,255,0.65)"
        textAnchor="middle" dominantBaseline="middle" letterSpacing="1.5">
        AVAILABILITY
      </text>
    </svg>
  );
}
