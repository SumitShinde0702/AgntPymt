import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Store } from "lucide-react";
import { api } from "../lib/api";

type Vendor = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  erc8004AgentId: string | null;
  erc8004Status: string;
};

function statusBadge(vendor: Vendor) {
  if (vendor.erc8004Status === "complete") {
    return { label: "On-chain", className: "bg-emerald-50 text-emerald-700" };
  }
  if (vendor.erc8004AgentId || vendor.erc8004Status === "registered") {
    return { label: "Setup in progress", className: "bg-amber-50 text-amber-800" };
  }
  return { label: "Not registered", className: "bg-slate-100 text-slate-600" };
}

export function SellersPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    void api<Vendor[]>("/api/vendors")
      .then(setVendors)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load sellers");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return <div className="text-slate-500">Loading sellers…</div>;
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Seller agents</h1>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">API server unreachable</p>
          <p className="mt-1 text-amber-800">
            Run <code className="rounded bg-amber-100 px-1">npm run dev</code> in the project root, then retry.
          </p>
          <button type="button" onClick={load} className="btn-primary-sm mt-3">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Seller agents</h1>
        <p className="text-slate-500">
          Negotiation counterparts in the demo. Each seller needs an ERC-8004 identity so your buyer
          agents can rate them after payment.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {vendors.map((v) => {
          const badge = statusBadge(v);
          return (
            <Link
              key={v.id}
              to={`/sellers/${v.id}`}
              className="group block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-accent-cyan/40 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900 group-hover:text-accent-navy">{v.name}</h3>
                    <p className="text-sm capitalize text-slate-500">{v.category}</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-accent-cyan" />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>
                  {badge.label}
                </span>
                {v.erc8004AgentId && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                    NFT #{v.erc8004AgentId}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
