'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n';

interface ScoreRingProps {
  score: number; // 0–10
  size?: number;
  strokeWidth?: number;
  label?: string;
  animate?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 8) return '#7a9a78'; // sage
  if (score >= 6) return '#c8a268'; // gold
  return '#b07265'; // rust
}

export default function ScoreRing({
  score,
  size = 80,
  strokeWidth = 3,
  label,
  animate = true,
}: ScoreRingProps) {
  const circleRef = useRef<SVGCircleElement>(null);
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (score / 10) * circumference;
  const color = scoreColor(score);

  useEffect(() => {
    if (!animate || !circleRef.current) return;
    const el = circleRef.current;
    el.style.strokeDashoffset = String(circumference);
    el.style.transition = 'none';
    // Force reflow
    void el.getBoundingClientRect();
    el.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)';
    el.style.strokeDashoffset = String(dashOffset);
  }, [score, animate, circumference, dashOffset]);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1e1e1e"
            strokeWidth={strokeWidth}
          />
          {/* Progress */}
          <circle
            ref={circleRef}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={animate ? circumference : dashOffset}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-display leading-none"
            style={{ fontSize: size * 0.3, color }}
          >
            {Number.isInteger(score) ? score : score.toFixed(1)}
          </span>
        </div>
      </div>
      {label && (
        <span className="text-xs text-ink-muted text-center leading-tight">{label}</span>
      )}
    </div>
  );
}

// ─── Large final score display ────────────────────────────────────────────────

export function FinalScoreRing({ score }: { score: number }) {
  const { t } = useI18n();
  return (
    <ScoreRing
      score={score}
      size={120}
      strokeWidth={4}
      label={t('score_overall')}
    />
  );
}
