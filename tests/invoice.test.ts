import { describe, it, expect } from "vitest";
import { computeInvoiceTotals, computeInvoiceLineTotal } from "@shared/invoice";

describe("computeInvoiceLineTotal", () => {
  it("multiplies quantity by unit price", () => {
    expect(computeInvoiceLineTotal({ quantity: 3, unitPrice: 150 })).toBe(450);
  });

  it("rounds to two decimals", () => {
    expect(computeInvoiceLineTotal({ quantity: 3, unitPrice: 33.333 })).toBe(100);
  });
});

describe("computeInvoiceTotals", () => {
  it("sums line items into the subtotal", () => {
    const totals = computeInvoiceTotals([
      { quantity: 2, unitPrice: 150 },
      { quantity: 1, unitPrice: 80 },
    ]);
    expect(totals).toEqual({ subtotal: 380, taxAmount: 0, totalAmount: 380 });
  });

  it("applies a tax rate", () => {
    const totals = computeInvoiceTotals([{ quantity: 1, unitPrice: 100 }], 0.16);
    expect(totals).toEqual({ subtotal: 100, taxAmount: 16, totalAmount: 116 });
  });

  it("rounds subtotal, tax and total to two decimals", () => {
    const totals = computeInvoiceTotals([{ quantity: 3, unitPrice: 33.333 }], 0.16);
    expect(totals).toEqual({ subtotal: 100, taxAmount: 16, totalAmount: 116 });
  });

  it("handles an empty invoice", () => {
    expect(computeInvoiceTotals([], 0.16)).toEqual({
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
    });
  });
});
