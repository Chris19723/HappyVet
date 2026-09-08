import type { InvoiceWithDetails } from "@shared/schema";
import { CLINIC_INFO } from "@/lib/clinic";
import { paymentMethodLabel } from "@shared/payment";

// 80mm thermal-ticket receipt. Rendered inside a print-only container on the
// billing page; the print CSS (index.css) isolates it and sizes the page.
export default function InvoiceReceipt({ invoice }: { invoice: InvoiceWithDetails }) {
  const money = (v: number | string | null | undefined) => `$${(Number(v) || 0).toFixed(2)}`;
  const date = invoice.issueDate ? new Date(invoice.issueDate) : new Date();
  const statusLabel: Record<string, string> = {
    paid: "PAGADA",
    pending: "PENDIENTE",
    overdue: "VENCIDA",
    cancelled: "CANCELADA",
  };

  return (
    <div className="receipt">
      {/* Header */}
      <div className="receipt-center">
        <img src="/assets/logo.png" alt="" className="receipt-logo" />
        <div className="receipt-title">{CLINIC_INFO.name}</div>
        {CLINIC_INFO.address && <div className="receipt-muted">{CLINIC_INFO.address}</div>}
        {CLINIC_INFO.phone && <div className="receipt-muted">{CLINIC_INFO.phone}</div>}
        {CLINIC_INFO.rfc && <div className="receipt-muted">{CLINIC_INFO.rfc}</div>}
      </div>

      <div className="receipt-sep" />

      {/* Meta */}
      <div className="receipt-row"><span>Folio:</span><span>{invoice.invoiceNumber}</span></div>
      <div className="receipt-row">
        <span>Fecha:</span>
        <span>{date.toLocaleDateString("es-MX")} {date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="receipt-row">
        <span>Cliente:</span>
        <span>{invoice.owner?.firstName} {invoice.owner?.lastName}</span>
      </div>
      {invoice.patient?.name && (
        <div className="receipt-row"><span>Paciente:</span><span>{invoice.patient.name}</span></div>
      )}

      <div className="receipt-sep" />

      {/* Items */}
      <div className="receipt-items-head">
        <span>Concepto</span><span>Importe</span>
      </div>
      {invoice.items?.map((it) => (
        <div key={it.id} className="receipt-item">
          <div className="receipt-item-desc">{it.description}</div>
          <div className="receipt-row receipt-item-line">
            <span>{it.quantity} × {money(it.unitPrice)}</span>
            <span>{money(it.totalPrice)}</span>
          </div>
        </div>
      ))}

      <div className="receipt-sep" />

      {/* Totals */}
      <div className="receipt-row"><span>Subtotal</span><span>{money(invoice.subtotal)}</span></div>
      {Number(invoice.taxAmount) > 0 && (
        <div className="receipt-row"><span>IVA</span><span>{money(invoice.taxAmount)}</span></div>
      )}
      <div className="receipt-row receipt-total"><span>TOTAL</span><span>{money(invoice.totalAmount)}</span></div>

      <div className="receipt-sep" />

      <div className="receipt-row"><span>Estado:</span><span>{statusLabel[invoice.status ?? "pending"] ?? invoice.status}</span></div>
      {invoice.status === "paid" && (
        <div className="receipt-row"><span>Pago:</span><span>{paymentMethodLabel(invoice.paymentMethod)}</span></div>
      )}

      <div className="receipt-sep" />

      <div className="receipt-center receipt-footer">{CLINIC_INFO.footer}</div>
    </div>
  );
}
