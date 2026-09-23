// Shared formatting helpers for the super-admin panel.

/**
 * Compact INR formatting using Indian lakh/crore scale.
 * Keeps one decimal so values aren't misleadingly rounded
 * (e.g. ₹1,500 → "₹1.5k", not "₹2k"). Trailing ".0" is stripped.
 */
export function formatINR(amount: number): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
}

/** Full INR amount with grouping, e.g. ₹1,23,456. */
export function formatINRFull(amount: number): string {
  return `₹${(Number(amount) || 0).toLocaleString("en-IN")}`;
}
