/** Format USDC atom units (1e6) to human-readable string. */
export function formatUsdc(atoms: bigint | string | number, decimals = 2): string {
  const n = typeof atoms === 'bigint' ? Number(atoms) : Number(atoms);
  return (n / 1_000_000).toFixed(decimals);
}

/** Format seconds into human-readable duration. */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

/** Shorten an Ethereum address for display. */
export function shortAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

/** Format unix-ms timestamp to locale string. */
export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

/** Parse a decimal USDC amount string to atom bigint (safe for 1Shot minFee). */
export function parseUsdcToAtoms(amount: string, decimals = 6): bigint {
  if (!amount.includes('.')) return BigInt(amount);
  const [whole, frac = ''] = amount.split('.');
  const padded = frac.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(padded);
}
