import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Store } from "lucide-react";
import { Erc8004Panel } from "../components/agents/Erc8004Panel";
import { api } from "../lib/api";

type Vendor = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  erc8004AgentId: string | null;
  erc8004Status: string;
};

export function SellerDetailPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const [vendor, setVendor] = useState<Vendor | null>(null);

  useEffect(() => {
    if (!vendorId) return;
    void api<Vendor[]>("/api/vendors").then((list) => {
      setVendor(list.find((v) => v.id === vendorId) ?? null);
    });
  }, [vendorId]);

  if (!vendorId) return null;

  if (!vendor) {
    return <div className="text-slate-500">Loading seller agent…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/sellers"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-accent-cyan"
      >
        <ArrowLeft className="h-4 w-4" />
        All seller agents
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
            <Store className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{vendor.name}</h1>
            <p className="capitalize text-slate-500">{vendor.category}</p>
            {vendor.description && <p className="mt-2 text-sm text-slate-600">{vendor.description}</p>}
          </div>
        </div>
      </div>

      <p className="text-sm text-slate-600">
        Register this seller on ERC-8004 so buyer agents can rate it after payments. Buyers sign ratings
        with their own agent wallet automatically after x402 settlement.
      </p>

      <Erc8004Panel
        apiBase={`/api/vendors/${vendorId}/erc8004`}
        variant="seller"
        title="Seller on-chain identity"
      />
    </div>
  );
}
