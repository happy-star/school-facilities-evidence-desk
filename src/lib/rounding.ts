/**
 * Half-up rounding of numerator/denominator*100 to the printed number of decimals.
 * Uses integer arithmetic so binary floats do not decide the last digit.
 * Returns null when the denominator is 0 — that percentage is undefined.
 */
export function roundPercentageFromCounts(
  numerator: number,
  denominator: number,
  decimals: number,
): string | null {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator) || denominator <= 0) {
    return null;
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
    return null;
  }
  const scale = 10 ** decimals;
  const scaledNumerator = numerator * 100 * scale;
  if (!Number.isSafeInteger(scaledNumerator)) {
    return null;
  }
  const quotient = Math.floor(scaledNumerator / denominator);
  const remainder = scaledNumerator % denominator;
  const rounded = remainder * 2 >= denominator ? quotient + 1 : quotient;
  if (decimals === 0) {
    return String(rounded);
  }
  const whole = Math.floor(rounded / scale);
  const fraction = String(rounded % scale).padStart(decimals, "0");
  return `${whole}.${fraction}`;
}

export function decimalPlaces(token: string): number | null {
  if (!/^\d+(\.\d+)?$/.test(token)) return null;
  const dot = token.indexOf(".");
  return dot === -1 ? 0 : token.length - dot - 1;
}
