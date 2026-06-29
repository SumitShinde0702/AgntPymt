/** Format USDC amounts — extra precision for micro-payments under $1. */
export function formatUsdc(amount: number): string {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)} USDC`;
  if (amount < 1) return `$${amount.toFixed(2)} USDC`;
  return `$${amount.toFixed(2)} USDC`;
}
