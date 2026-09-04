import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/authUtils";
import { trackEvent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Receipt } from "lucide-react";
import type { AppointmentWithDetails, Treatment, InventoryItem, Owner } from "@shared/schema";

interface LineItem {
  _id: string;
  treatmentId: string;
  inventoryItemId: string;
  description: string;
  quantity: number;
  unitPrice: string;
}

interface ServicesInvoiceModalProps {
  // When present: bill an appointment. When absent: counter sale (walk-in).
  appointment?: AppointmentWithDetails | null;
  open: boolean;
  onClose: () => void;
  onSuccess: (invoiceNumber: string) => void;
}

let _seq = 0;
function newId() { return `li-${++_seq}`; }

function emptyItem(): LineItem {
  return { _id: newId(), treatmentId: "", inventoryItemId: "", description: "", quantity: 1, unitPrice: "" };
}

export default function ServicesInvoiceModal({
  appointment, open, onClose, onSuccess,
}: ServicesInvoiceModalProps) {
  const { toast } = useToast();
  const isSale = !appointment;
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [generating, setGenerating] = useState(false);
  const [saleOwnerId, setSaleOwnerId] = useState<string>("");
  const generationInProgress = useRef(false);

  const { data: treatments } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments"],
    retry: false,
  });

  // Counter-sale extras: customer list + the generic "Público General" customer.
  const { data: owners } = useQuery<Owner[]>({
    queryKey: ["/api/owners"],
    retry: false,
    enabled: isSale,
  });
  const { data: publicOwner } = useQuery<Owner>({
    queryKey: ["/api/public-owner"],
    retry: false,
    enabled: isSale,
  });

  // Default the walk-in customer to "Público General" once it loads.
  useEffect(() => {
    if (isSale && publicOwner && !saleOwnerId) {
      setSaleOwnerId(publicOwner.id);
    }
  }, [isSale, publicOwner, saleOwnerId]);

  const ownerId = appointment ? appointment.patient.ownerId : saleOwnerId;
  const patientId = appointment ? appointment.patientId : null;
  const appointmentId = appointment ? appointment.id : null;

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    retry: false,
  });

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it) => it._id === id ? { ...it, ...patch } : it));
  };

  // Selector value is prefixed: "t:<id>" service, "p:<id>" product, "__manual__".
  const selectValue = (item: LineItem) =>
    item.inventoryItemId ? `p:${item.inventoryItemId}`
      : item.treatmentId ? `t:${item.treatmentId}`
      : "__manual__";

  const handleCatalogSelect = (itemId: string, value: string) => {
    if (value === "__manual__") {
      updateItem(itemId, { treatmentId: "", inventoryItemId: "", description: "", unitPrice: "" });
      return;
    }
    if (value.startsWith("t:")) {
      const treatment = treatments?.find((t) => t.id === value.slice(2));
      if (treatment) {
        updateItem(itemId, {
          treatmentId: treatment.id,
          inventoryItemId: "",
          description: treatment.name,
          unitPrice: String(treatment.price),
        });
      }
      return;
    }
    if (value.startsWith("p:")) {
      const product = inventory?.find((p) => p.id === value.slice(2));
      if (product) {
        updateItem(itemId, {
          inventoryItemId: product.id,
          treatmentId: "",
          description: product.name,
          // Catalog price. The server is the source of truth and re-applies it.
          unitPrice: String(product.unitPrice ?? "0"),
        });
      }
    }
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (id: string) => setItems((prev) => prev.filter((it) => it._id !== id));

  const lineTotal = (item: LineItem) => {
    const price = parseFloat(item.unitPrice) || 0;
    return price * item.quantity;
  };

  const subtotal = items.reduce((sum, it) => sum + lineTotal(it), 0);

  const handleGenerate = async () => {
    if (generationInProgress.current) return;

    const validItems = items.filter(
      (it) => it.description.trim() && parseFloat(it.unitPrice) > 0 && it.quantity > 0
    );
    if (validItems.length === 0) {
      toast({ title: "Sin servicios", description: "Agrega al menos un servicio con descripción y precio.", variant: "destructive" });
      return;
    }

    generationInProgress.current = true;
    setGenerating(true);
    try {
      // Server computes subtotal/tax/total from these items and creates the
      // invoice + items atomically. Client no longer sends any amounts.
      const invoicePayload = {
        ownerId,
        patientId,
        appointmentId,
        taxRate: 0,
        items: validItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          treatmentId: item.treatmentId || null,
          inventoryItemId: item.inventoryItemId || null,
        })),
      };

      const invoiceRes = await apiRequest("POST", "/api/invoices", invoicePayload);
      const invoice = await invoiceRes.json();
      trackEvent("invoice_created", {
        source: appointment ? "appointment" : "walk_in",
        item_count: validItems.length,
        inventory_item_count: validItems.filter((item) => Boolean(item.inventoryItemId)).length,
      });

      // Only appointment invoicing marks the appointment completed.
      if (appointment && appointment.status !== "completed") {
        await apiRequest("PUT", `/api/appointments/${appointment.id}`, { status: "completed" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });

      onSuccess(invoice.invoiceNumber);
      setItems([emptyItem()]);
    } catch (err) {
      console.error("Error generating invoice:", err);
      const msg = err instanceof Error ? err.message : "";
      if (err instanceof Error && isUnauthorizedError(err)) {
        toast({
          title: "Sesión expirada",
          description: "Tu sesión terminó. Inicia sesión nuevamente para generar la factura.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
      } else if (msg.includes("INSUFFICIENT_STOCK")) {
        toast({ title: "Sin stock suficiente", description: "Uno de los productos no tiene stock suficiente. Ajusta la cantidad o repón inventario.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: "No se pudo generar la factura.", variant: "destructive" });
      }
    } finally {
      generationInProgress.current = false;
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setItems([emptyItem()]);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            {isSale ? "Nueva Venta" : `Agregar Servicios y Productos — ${appointment!.patient.name}`}
          </DialogTitle>
        </DialogHeader>

        {isSale ? (
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-500">Cliente</label>
            <Select value={saleOwnerId} onValueChange={setSaleOwnerId}>
              <SelectTrigger className="h-9 text-sm bg-white mt-1">
                <SelectValue placeholder="Seleccionar cliente..." />
              </SelectTrigger>
              <SelectContent>
                {publicOwner && (
                  <SelectItem value={publicOwner.id}>Público General (mostrador)</SelectItem>
                )}
                {owners?.filter((o) => o.id !== publicOwner?.id).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.firstName} {o.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="text-sm text-slate-500 mb-4">
            Propietario: <span className="font-medium text-slate-700">
              {appointment!.patient.owner.firstName} {appointment!.patient.owner.lastName}
            </span>
          </div>
        )}

        {/* Line items */}
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item._id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Concepto {index + 1}</span>
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                    onClick={() => removeItem(item._id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Catalog selector */}
              <Select
                value={selectValue(item)}
                onValueChange={(v) => handleCatalogSelect(item._id, v)}
              >
                <SelectTrigger className="h-8 text-sm bg-white">
                  <SelectValue placeholder="Seleccionar del catálogo o manual..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Ingreso manual —</SelectItem>
                  {treatments && treatments.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Servicios</SelectLabel>
                      {treatments.map((t) => (
                        <SelectItem key={t.id} value={`t:${t.id}`}>
                          {t.name} — ${Number(t.price).toFixed(2)} MXN
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {inventory && inventory.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Productos</SelectLabel>
                      {inventory.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={`p:${p.id}`}
                          disabled={(p.currentStock ?? 0) <= 0}
                        >
                          {p.name} — ${Number(p.unitPrice ?? 0).toFixed(2)} MXN · stock: {p.currentStock ?? 0}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>

              {/* Description, quantity, unit price */}
              <div className="grid grid-cols-12 gap-2">
                <Input
                  className="col-span-6 h-8 text-sm"
                  placeholder="Descripción"
                  value={item.description}
                  onChange={(e) => updateItem(item._id, { description: e.target.value })}
                />
                <Input
                  className="col-span-2 h-8 text-sm"
                  placeholder="Cant."
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) => updateItem(item._id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <Input
                  className="col-span-3 h-8 text-sm"
                  placeholder="Precio"
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  disabled={!!item.inventoryItemId}
                  title={item.inventoryItemId ? "Precio tomado del catálogo de inventario" : undefined}
                  onChange={(e) => updateItem(item._id, { unitPrice: e.target.value })}
                />
                <div className="col-span-1 h-8 flex items-center justify-end text-sm font-medium text-slate-700">
                  {lineTotal(item) > 0 && `$${lineTotal(item).toFixed(0)}`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full mt-2">
          <Plus className="h-4 w-4 mr-1" />
          Agregar concepto
        </Button>

        <Separator className="my-4" />

        {/* Total */}
        <div className="flex justify-between items-center text-lg font-semibold text-slate-900">
          <span>Total</span>
          <span className="text-primary">${subtotal.toFixed(2)} MXN</span>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-4">
          <Button type="button" variant="outline" onClick={handleClose} disabled={generating}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={generating || subtotal <= 0 || (isSale && !ownerId)}
            className="gap-2"
          >
            <Receipt className="h-4 w-4" />
            {generating ? "Generando..." : isSale ? "Cobrar" : "Generar Factura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
