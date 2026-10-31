// Helpers shared by the converter modules (not part of the public barrel).

/** Exact JS number when it fits, otherwise the decimal string (never a rounded number). */
export const vnum = (v: bigint): number | string =>
  v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER) ? Number(v) : v.toString();
