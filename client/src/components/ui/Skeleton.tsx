import { Loader2 } from "lucide-react";

/** Shimmering placeholder block — see `.skeleton` in index.css for the animation. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} />;
}

/** Inline spinner + label for small, in-place loading states (panels, tabs, sections). */
export function Spinner({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <p className={`flex items-center gap-2 text-sm text-slate-500 ${className}`}>
      <Loader2 className="h-4 w-4 animate-spin text-accent-cyan" />
      {label}
    </p>
  );
}

const gridColsMap: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
};

/** Generic page skeleton: title + subtitle + a row of stat cards + a content block. Good default for most list/detail pages. */
export function PageSkeleton({ cards = 3 }: { cards?: 2 | 3 | 4 }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className={`grid gap-4 ${gridColsMap[cards]}`}>
        {Array.from({ length: cards }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
    </div>
  );
}
