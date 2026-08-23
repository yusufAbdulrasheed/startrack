// All money passes through here. Amounts are stored as Numbers rounded to
// 2 decimals at every write (pilot-scale pragmatism; the blueprint's
// Decimal128/minor-units upgrade slots in behind this one helper).
export const money = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const isValidAmount = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
