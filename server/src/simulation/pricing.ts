/** Format USDC amounts — keep enough decimals so micro ceilings like 0.000001 don't show as $0.0000. */
export function formatUsdc(amount: number): string {
  if (!Number.isFinite(amount)) return "$0.00 USDC";
  if (amount === 0) return "$0.00 USDC";

  const abs = Math.abs(amount);
  if (abs >= 0.01) return `$${amount.toFixed(2)} USDC`;

  // Enough places that a non-zero value never rounds to all zeros (cap at 8).
  const places = Math.min(8, Math.max(4, Math.ceil(-Math.log10(abs))));
  const raw = amount.toFixed(places);
  const trimmed = raw.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
  return `$${trimmed} USDC`;
}

