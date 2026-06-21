import { Suspense, type ReactNode } from 'react';

function RouteFallback() {
  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-2xl border border-border-subtle bg-void/40" />
          <div className="h-44 animate-pulse rounded-2xl border border-border-subtle bg-void/30" />
          <div className="h-24 animate-pulse rounded-2xl border border-border-subtle bg-void/25" />
        </div>
      </div>
    </div>
  );
}

export default function RouteSuspenseBoundary({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}
