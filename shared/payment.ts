// Payment methods the clinic accepts. Single source of truth for forms,
// validation, and the revenue-by-method breakdown.
export const PAYMENT_METHODS = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];

export const PAYMENT_METHOD_VALUES: PaymentMethod[] = PAYMENT_METHODS.map(
  (m) => m.value,
);

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHOD_VALUES as string[]).includes(value);
}

// Human label for a stored method; falls back gracefully for paid invoices
// that predate this feature (no method recorded).
export function paymentMethodLabel(value?: string | null): string {
  const found = PAYMENT_METHODS.find((m) => m.value === value);
  return found?.label ?? "Sin especificar";
}
