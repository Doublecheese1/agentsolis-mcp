const SCALE = 1_000_000n;

export function parseUsdc(value: string): bigint {
  if (typeof value !== "string") {
    throw new Error("Enter a USDC amount as a decimal string.");
  }
  const trimmed = value.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) {
    throw new Error("Enter a USDC amount with at most 6 decimal places.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  const units = BigInt(whole) * SCALE + BigInt(frac.padEnd(6, "0"));
  if (units <= 0n) {
    throw new Error("Budget must be greater than zero.");
  }
  if (units >= 2n ** 256n) {
    throw new Error("Amount is too large.");
  }
  return units;
}

/** USDC decimal string with at least two fraction digits and no thousands separator. */
export function formatUsdc(units: bigint): string {
  const negative = units < 0n;
  const absolute = negative ? -units : units;
  const whole = absolute / SCALE;
  let fraction = (absolute % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  if (fraction.length < 2) fraction = fraction.padEnd(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}
