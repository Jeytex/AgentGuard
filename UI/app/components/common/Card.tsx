import React from 'react';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  role?: string;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLElement>) => void;
  'aria-label'?: string;
}

export const Card = React.memo(function Card({
  children,
  className = '',
  onClick,
  role,
  tabIndex,
  onKeyDown,
  'aria-label': ariaLabel,
}: CardProps) {
  const isClickable = !!onClick;

  return (
    <section
      onClick={onClick}
      role={role || (isClickable ? 'button' : undefined)}
      tabIndex={tabIndex ?? (isClickable ? 0 : undefined)}
      aria-label={ariaLabel}
      onKeyDown={
        onKeyDown ||
        (isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined)
      }
      className={`retro-window rounded-2xl border-2 border-[var(--line)] bg-[var(--panel)] transition-all ${
        isClickable
          ? 'cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-[var(--cyan)]/40 hover:-translate-y-0.5'
          : ''
      } ${className}`}
    >
      {children}
    </section>
  );
});

