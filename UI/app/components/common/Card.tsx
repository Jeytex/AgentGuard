import React from 'react';

export const Card = React.memo(function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`retro-window rounded-2xl border-2 border-[var(--line)] bg-[var(--panel)] transition-all ${className}`}
    >
      {children}
    </section>
  );
});
