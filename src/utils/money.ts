/**
 * Format a number as VND currency string.
 * Example: 120000 → "120,000"
 */
export function formatVND(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}

/**
 * Parse a cost string that may contain commas or VND suffix.
 * Returns the numeric value or null if invalid.
 */
export function parseCost(input: string): number | null {
  const cleaned = input.replace(/[,.\s]/g, '').replace(/vnd$/i, '').trim();
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? null : num;
}
