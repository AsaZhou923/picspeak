// Deterministic star particle data — no Math.random() to avoid SSR hydration mismatch
// Positions generated via two coprime LCG sequences for good visual spread
const STARS = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  x: (i * 347 + 71) % 100,
  y: (i * 151 + 23) % 100,
  size: i % 7 === 0 ? 3 : i % 3 === 0 ? 2 : 1,  // 1-3px
  isGold: i % 5 === 0,
  duration: 3 + (i % 6),
  delay: -((i * 70) % 900) / 100,
  lo: 0.08 + (i % 4) * 0.04,    // dim: 0.08–0.20
  hi: 0.45 + (i % 5) * 0.11,    // bright: 0.45–0.89
}));

export default function BackgroundEffect() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
    >
      {/* ── Aurora orbs ───────────────────────────────────── */}
      <div className="bg-orb bg-orb-gold" />
      <div className="bg-orb bg-orb-indigo" />
      <div className="bg-orb bg-orb-teal" />

      {/* ── Twinkling star particles ──────────────────────── */}
      {STARS.map((s) => (
        <div
          key={s.id}
          className="bg-star"
          style={
            {
              left: `${s.x}%`,
              top: `${s.y}%`,
              width: `${s.size}px`,
              height: `${s.size}px`,
              backgroundColor: s.isGold ? '#c8a268' : '#e8dfd0',
              '--duration': `${s.duration}s`,
              '--delay': `${s.delay}s`,
              '--lo': s.lo,
              '--hi': s.hi,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
