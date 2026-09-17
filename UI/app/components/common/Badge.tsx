import React from 'react';
import { GuardVerdict, RiskLevel } from '../../types';

interface BadgeProps {
  children?: React.ReactNode;
  kind?: GuardVerdict | RiskLevel | string;
  size?: 'sm' | 'md';
}

export const Badge = React.memo(function Badge({ children, kind = 'ALLOW', size = 'sm' }: BadgeProps) {
  const upper = String(kind).toUpperCase();
  let color = '#62d99a'; // green
  let label = children || upper;

  if (upper === 'BLOCK' || upper === 'CRITICAL' || upper === 'REJECTED') {
    color = '#ff6d7a'; // red
  } else if (upper === 'REQUIRE_APPROVAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'PENDING') {
    color = '#e7b96b'; // amber
  } else if (upper === 'LOW' || upper === 'ALLOW' || upper === 'APPROVED') {
    color = '#62d99a'; // green
  } else {
    color = '#56d8e4'; // cyan
  }

  const text = String(label).replace('REQUIRE_APPROVAL', 'HUMAN APPROVAL');
  const paddingClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      style={{
        color,
        borderColor: `${color}55`,
        backgroundColor: `${color}15`,
      }}
      className={`inline-flex items-center rounded-md border font-mono font-semibold uppercase tracking-wider ${paddingClass}`}
    >
      {text}
    </span>
  );
});

export const RiskScoreBadge = React.memo(function RiskScoreBadge({ score }: { score: number }) {
  let color = '#62d99a';
  if (score >= 80) color = '#ff6d7a';
  else if (score >= 40) color = '#e7b96b';

  return (
    <span
      style={{ color, borderColor: `${color}44`, backgroundColor: `${color}12` }}
      className="inline-flex items-center rounded px-2 py-0.5 font-mono text-xs font-bold"
    >
      {score}/100
    </span>
  );
});
