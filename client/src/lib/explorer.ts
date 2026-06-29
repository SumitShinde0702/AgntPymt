export const BASE_SEPOLIA_EXPLORER = "https://sepolia.basescan.org";

export function txExplorerUrl(txHash: string) {
  return `${BASE_SEPOLIA_EXPLORER}/tx/${txHash}`;
}

export function addressExplorerUrl(address: string) {
  return `${BASE_SEPOLIA_EXPLORER}/address/${address}`;
}
