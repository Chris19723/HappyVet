import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Receipt } from "lucide-react";
import type { AppointmentWithDetails, Treatment } from "@shared/schema";

interface LineItem {
  _id: string;
  treatmentId: string;
  description: string;
  quantity: number;
  unitPrice: string;
}

interface ServicesInvoiceModalProps {
  appointment: AppointmentWithDetails;
  open: boolean;
  onClose: () => void;
  onSuccess: (invoiceNumber: string) => void;
}

let _seq = 0;
function newId() { return `li-${++_seq}`; }

function emptyItem(): LineItem {
  return { _id: newId(), treatmentId: "", description: "", quantity: 1, unitPrice: "" };
}

export default function ServicesInvoiceModal({
  appointment, open, onClose, onSuccess,
}: ServicesInvoiceModalProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<LineItem[]>([emptyItem()]);
  const [generating, setGenerating] = useState(false);
  const generationInProgress = useRef(false);

  const { data: treatments } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments"],
    retry: false,
  });

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems((prev) => prev.map((it) => it._id === id ? { ...it, ...patch } : it));
  };

  const handleTreatmentSelect = (itemId: string, treatmentId: string) => {
    if (treatmentId === "__manual__") {
      updateItem(itemId, { treatmentId: "", description: "", unitPrice: "" });
      return;
    }
    const treatment = treatments?.find((t) => t.id === treatmentId);
    if (treatment) {
      updateItem(itemId, {
        treatmentId: treatment.id,
        description: treatment.name,
        unitPrice: String(treatment.price),
      });
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
      const invoicePayload = {
        ownerId: appointment.patient.ownerId,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        taxRate: 0,
        items: validItems.map((item) => ({
          treatmentId: item.treatmentId || null,
          description: item.description.trim(),
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
        })),
      };

      const invoiceRes = await apiRequest("POST", "/api/invoices", invoicePayload);
      const invoice = await invoiceRes.json();

      if (appointment.status !== "completed") {
        await apiRequest("PUT", `/api/appointments/${appointment.id}`, { status: "completed" });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });

      onSuccess(invoice.invoiceNumber);
      setItems([emptyItem()]);
    } catch (err) {
      console.error("Error generating invoice:", err);
      toast({ title: "Error", description: "No se pudo generar la factura.", variant: "destructive" });
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
            Agregar Servicios — {appointment.patient.name}
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-slate-500 mb-4">
          Propietario: <span className="font-medium text-slate-700">
            {appointment.patient.owner.firstName} {appointment.patient.owner.lastName}
          </span>
        </div>

        {/* Line items */}
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item._id} className="border rounded-lg p-3 space-y-2 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Servicio {index + 1}</span>
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
                value={item.treatmentId || "__manual__"}
                onValueChange={(v) => handleTreatmentSelect(item._id, v)}
              >
                <SelectTrigger className="h-8 text-sm bg-white">
                  <SelectValue placeholder="Seleccionar del catálogo o manual..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">— Ingreso manual —</SelectItem>
                  {treatments?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — ${Number(t.price).toFixed(2)} MXN
                      {t.category ? ` (${t.category})` : ""}
                    </SelectItem>
                  ))}
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
          Agregar servicio
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
            disabled={generating || subtotal <= 0}
            className="gap-2"
          >
            <Receipt className="h-4 w-4" />
            {generating ? "Generando..." : "Generar Factura"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
