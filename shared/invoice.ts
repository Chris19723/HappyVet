// Pure invoice math, shared by the server (source of truth for totals) and
// easily unit-tested without a database.

export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Line total (quantity * unitPrice), rounded to 2 decimals. */
export function computeInvoiceLineTotal(item: InvoiceLineInput): number {
  return round2(item.quantity * item.unitPrice);
}

/**
 * Computes invoice totals from line items and a tax rate (0..1).
 * All values are rounded to 2 decimals.
 */
export function computeInvoiceTotals(
  items: InvoiceLineInput[],
  taxRate = 0
): InvoiceTotals {
  const subtotal = round2(
    items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0)
  );
  const taxAmount = round2(subtotal * taxRate);
  const totalAmount = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, totalAmount };
}
