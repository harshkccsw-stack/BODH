import * as React from 'react';
import { cn } from '@/lib/utils';

// Trimmed from the admin app's Card: only the four subcomponents the
// respondent pages use are kept (Card, CardHeader, CardContent, CardTitle).
// The variant/context system is dropped — the portal only ever uses the
// default look — so these are plain styled divs.

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col items-stretch text-card-foreground rounded-xl bg-card border border-border shadow-xs',
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex items-center justify-between flex-wrap px-5 min-h-14 gap-2.5 border-b border-border', className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div data-slot="card-content" className={cn('grow p-5', className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      data-slot="card-title"
      className={cn('text-base font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  );
}

export { Card, CardContent, CardHeader, CardTitle };
