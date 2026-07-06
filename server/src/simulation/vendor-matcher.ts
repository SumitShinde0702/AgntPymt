import type { Vendor } from "@agntpymt/db";

const KEYWORDS: Record<string, string[]> = {
  travel: ["flight", "hotel", "book", "travel", "airline", "trip", "sfo", "jfk", "expedia"],
  procurement: ["order", "supply", "supplies", "mouse", "office", "amazon", "purchase", "equipment"],
  research: ["research", "data", "sector", "market", "report", "premium-data"],
  cloud: ["aws", "cloud", "invoice", "infrastructure", "gcp", "azure"],
  compute: ["compute", "batch", "forecast", "forecasting", "gpu", "premium-compute"],
};

export function matchVendor(
  vendors: Vendor[],
  purchaseIntent: string,
  agentCategory?: string,
  resourceId?: string
): Vendor {
  if (resourceId) {
    const aliasMap: Record<string, string> = {
      "premium-data": "vendor_marketdata",
      "premium-compute": "vendor_cloudbatch",
    };
    const vendorId = aliasMap[resourceId];
    if (vendorId) {
      const found = vendors.find((v) => v.id === vendorId);
      if (found) return found;
    }
  }

  const text = purchaseIntent.toLowerCase();
  let bestCategory = agentCategory ?? "generic";
  let bestScore = 0;

  for (const [category, words] of Object.entries(KEYWORDS)) {
    const score = words.reduce((acc, word) => (text.includes(word) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  const match = vendors.find((v) => v.category === bestCategory);
  if (match) return match;

  const fallback = vendors.find((v) => v.category === "generic") ?? vendors[0];
  if (!fallback) {
    throw new Error(
      "No vendors in database — run `npm run db:seed` (or docker exec agntpymt node db/dist/seed.js)"
    );
  }
  return fallback;
}

export function buildFulfillment(vendor: Vendor, purchaseIntent: string, finalPrice: number) {
  switch (vendor.category) {
    case "travel":
      return {
        type: "booking_confirmation",
        pnr: `PNR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        route: purchaseIntent.match(/[A-Z]{3}\s*(?:→|->|to)\s*[A-Z]{3}/i)?.[0] ?? "SFO → JFK",
        totalUsd: finalPrice,
        status: "confirmed",
      };
    case "procurement":
      return {
        type: "order_confirmation",
        orderId: `ORD-${Date.now()}`,
        items: purchaseIntent,
        totalUsd: finalPrice,
        eta: "3-5 business days",
      };
    case "research":
      return {
        type: "data_delivery",
        dataset: "sector_overview_q4.json",
        sample: { sector: "Technology", growth: "12.4%", sources: 847 },
        totalUsd: finalPrice,
      };
    case "cloud":
      return {
        type: "invoice_paid",
        invoiceId: `INV-AWS-${Date.now()}`,
        period: "2026-03",
        totalUsd: finalPrice,
      };
    case "compute":
      return {
        type: "job_complete",
        jobId: `JOB-${Date.now()}`,
        status: "completed",
        totalUsd: finalPrice,
      };
    default:
      return {
        type: "generic_receipt",
        description: purchaseIntent,
        totalUsd: finalPrice,
        receiptId: `RCPT-${Date.now()}`,
      };
  }
}
