export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function computeInvoiceLineTotal(item: InvoiceLineInput): number {
  return roundMoney(item.quantity * item.unitPrice);
}

export function computeInvoiceTotals(
  items: InvoiceLineInput[],
  taxRate = 0,
): InvoiceTotals {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + computeInvoiceLineTotal(item), 0),
  );
  const taxAmount = roundMoney(subtotal * taxRate);
  const totalAmount = roundMoney(subtotal + taxAmount);

  return { subtotal, taxAmount, totalAmount };
}