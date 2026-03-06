interface LoadingSpinnerProps {
  size?: number;
  label?: string;
}

export default function LoadingSpinner({ size = 24, label }: LoadingSpinnerProps) {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        width={size}
        height={size}
        className="animate-spin-slow"
        style={{ animationDuration: '2s' }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#1e1e1e"
          strokeWidth={2}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#c8a268"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * 0.75}
        />
      </svg>
      {label && <p className="text-sm text-ink-muted">{label}</p>}
    </div>
  );
}

// ─── Skeleton block ────────────────────────────────────────────────────────────

export function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div
      className={`shimmer rounded ${className}`}
    />
  );
}
