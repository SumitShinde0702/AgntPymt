export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      <p className="mt-2 text-slate-500">Coming soon in a future release.</p>
    </div>
  );
}
