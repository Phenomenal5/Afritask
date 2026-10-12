// "YYYY-MM" months, as the performance API uses them.

// The month `by` months away ("2026-10", -1 → "2026-09").
export const shiftMonth = (month: string, by: number) => {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};
