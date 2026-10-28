export const usd = (cents: number | null | undefined) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: (cents ?? 0) % 100 ? 2 : 0 }).format((cents ?? 0) / 100);
export const toCents = (v: FormDataEntryValue | null) => Math.round(parseFloat(String(v ?? "0")) * 100) || 0;
