// Shared formatting helpers for the super-admin panel.

/**
 * Compact INR formatting for dashboard cards.
 * Keeps one decimal so values aren't misleadingly rounded
 * (e.g. ₹1,500 → "₹1.5k", not "₹2k"). Trailing ".0" is stripped.
 */
export function formatINR(amount: number): string {
  const n = Number(amount) || 0;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₹${n.toLocaleString("en-IN")}`;
}

/** Full INR amount with grouping, e.g. ₹1,23,456. */
export function formatINRFull(amount: number): string {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}
