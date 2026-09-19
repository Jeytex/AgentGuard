import React from 'react';
import { GuardVerdict, RiskLevel } from '../../types';

interface BadgeProps {
  children?: React.ReactNode;
  kind?: GuardVerdict | RiskLevel | string;
  size?: 'sm' | 'md';
}

export const Badge = React.memo(function Badge({ children, kind = 'ALLOW', size = 'sm' }: BadgeProps) {
  const upper = String(kind).toUpperCase();
  let textColor = '#26541b'; // dark forest green
  let bgColor = '#b9dc7944'; // retro green pastel
  let borderColor = '#26541b55';
  let label = children || upper;

  if (upper === 'BLOCK' || upper === 'CRITICAL' || upper === 'REJECTED') {
    textColor = '#8a1936'; // dark crimson red
    bgColor = '#ee86ad44'; // retro pink/red pastel
    borderColor = '#8a193655';
  } else if (upper === 'REQUIRE_APPROVAL' || upper === 'HIGH' || upper === 'MEDIUM' || upper === 'PENDING') {
    textColor = '#6d4508'; // dark amber bronze
    bgColor = '#f5cf7744'; // retro amber pastel
    borderColor = '#6d450855';
  } else if (upper === 'LOW' || upper === 'ALLOW' || upper === 'APPROVED') {
    textColor = '#26541b'; // dark forest green
    bgColor = '#b9dc7944'; // retro green pastel
    borderColor = '#26541b55';
  } else {
    textColor = '#134e56'; // dark teal cyan
    bgColor = '#8ed9d344'; // retro cyan pastel
    borderColor = '#134e5655';
  }

  const text = String(label).replace('REQUIRE_APPROVAL', 'HUMAN APPROVAL');
  const paddingClass = size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span
      style={{
        color: textColor,
        borderColor,
        backgroundColor: bgColor,
      }}
      className={`inline-flex items-center rounded-md border-2 font-mono font-bold uppercase tracking-wider ${paddingClass}`}
    >
      {text}
    </span>
  );
});

export const RiskScoreBadge = React.memo(function RiskScoreBadge({ score }: { score: number }) {
  let textColor = '#26541b';
  let bgColor = '#b9dc7944';
  let borderColor = '#26541b55';

  if (score >= 80) {
    textColor = '#8a1936';
    bgColor = '#ee86ad44';
    borderColor = '#8a193655';
  } else if (score >= 40) {
    textColor = '#6d4508';
    bgColor = '#f5cf7744';
    borderColor = '#6d450855';
  }

  return (
    <span
      style={{ color: textColor, borderColor, backgroundColor: bgColor }}
      className="inline-flex items-center rounded border-2 px-2 py-0.5 font-mono text-xs font-bold"
    >
      {score}/100
    </span>
  );
});
