import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { trackEvent } from "@/lib/analytics";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ShoppingCart, Trash2, TrendingDown } from "lucide-react";
import type { ExpenseWithItem, InventoryItem } from "@shared/schema";
import { EXPENSE_CATEGORIES, expenseCategoryLabel, PERSONAL_CATEGORY } from "@shared/expense";
import { PAYMENT_METHODS, paymentMethodLabel } from "@shared/payment";
import {
  getDayRangeInTimeZone,
  getWeekRangeInTimeZone,
  getMonthRangeInTimeZone,
  getRangeFromDayStringsInTimeZone,
} from "@shared/time";

const CLINIC_TIMEZONE = "America/Mexico_City";

type Period = "all" | "day" | "week" | "month" | "custom";
const PERIODS: { key: Period; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "custom", label: "Rango" },
];

// Categories available in the quick-expense form (inventory has its own flow).
const QUICK_CATEGORIES = EXPENSE_CATEGORIES.filter((c) => c.value !== "inventario");

function today() {
  return new Date().toISOString().slice(0, 10);
}

const CATEGORY_COLORS: Record<string, string> = {
  inventario: "bg-blue-100 text-blue-800",
  proveedor: "bg-teal-100 text-teal-800",
  operativo: "bg-amber-100 text-amber-800",
  personal: "bg-rose-100 text-rose-800",
};

export default function Expenses() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // Quick expense form
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("proveedor");
  const [method, setMethod] = useState<string>("efectivo");
  const [description, setDescription] = useState("");
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState(today());

  // Inventory purchase form
  const [pItemId, setPItemId] = useState("");
  const [pQty, setPQty] = useState("1");
  const [pAmount, setPAmount] = useState("");
  const [pSupplier, setPSupplier] = useState("");
  const [pMethod, setPMethod] = useState<string>("transferencia");
  const [pDate, setPDate] = useState(today());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: expenses, isLoading: expensesLoading, error } = useQuery<ExpenseWithItem[]>({
    queryKey: ["/api/expenses"],
    retry: false,
  });

  const { data: inventory } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    retry: false,
  });

  useEffect(() => {
    if (error && isUnauthorizedError(error as Error)) {
      toast({ title: "Sesión expirada", description: "Inicia sesión nuevamente.", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
    }
  }, [error, toast]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
    queryClient.invalidateQueries({
      predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/dashboard"),
    });
  };

  const createExpenseMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/expenses", body);
      return res.json();
    },
    onSuccess: (_data, body: any) => {
      invalidate();
      trackEvent("expense_created", { category: body.category });
      toast({ title: "Gasto registrado" });
    },
    onError: (err) => {
      if (isUnauthorizedError(err as Error)) {
        toast({ title: "Sesión expirada", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "No se pudo registrar el gasto.", variant: "destructive" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/expenses/${id}`); },
    onSuccess: () => { invalidate(); toast({ title: "Gasto eliminado" }); },
    onError: (err) => {
      if (isUnauthorizedError(err as Error)) {
        toast({ title: "Sesión expirada", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "No se pudo eliminar (¿permisos de admin?).", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  // Client-side period filtering (matches the billing page).
  const periodRange = (() => {
    const now = new Date();
    if (period === "day") return getDayRangeInTimeZone(now, CLINIC_TIMEZONE);
    if (period === "week") return getWeekRangeInTimeZone(now, CLINIC_TIMEZONE);
    if (period === "month") return getMonthRangeInTimeZone(now, CLINIC_TIMEZONE);
    if (period === "custom" && from && to) return getRangeFromDayStringsInTimeZone(from, to, CLINIC_TIMEZONE);
    return null;
  })();

  const all = expenses ?? [];
  const inPeriod = periodRange
    ? all.filter((e) => {
        if (!e.date) return false;
        const d = new Date(e.date);
        return d >= periodRange.start && d < periodRange.end;
      })
    : all;

  const total = inPeriod.reduce((s, e) => s + Number(e.amount), 0);
  const personal = inPeriod.filter((e) => e.category === PERSONAL_CATEGORY).reduce((s, e) => s + Number(e.amount), 0);
  const business = total - personal;

  const byCategory = QUICK_CATEGORIES.concat([{ value: "inventario", label: "Compra de inventario" }] as any)
    .map((c) => ({
      category: c.value,
      total: inPeriod.filter((e) => e.category === c.value).reduce((s, e) => s + Number(e.amount), 0),
    }))
    .filter((c) => c.total > 0);

  const submitExpense = () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Monto inválido", description: "Ingresa un monto mayor a 0.", variant: "destructive" });
      return;
    }
    createExpenseMutation.mutate(
      {
        amount: amt,
        category,
        paymentMethod: method,
        description: description.trim() || null,
        supplier: supplier.trim() || null,
        date: new Date(`${date}T12:00:00`).toISOString(),
      },
      {
        onSuccess: () => {
          setExpenseOpen(false);
          setAmount(""); setDescription(""); setSupplier("");
        },
      }
    );
  };

  const submitPurchase = () => {
    const amt = parseFloat(pAmount);
    const qty = parseInt(pQty);
    if (!pItemId) { toast({ title: "Elige un producto", variant: "destructive" }); return; }
    if (!qty || qty <= 0) { toast({ title: "Cantidad inválida", variant: "destructive" }); return; }
    if (!amt || amt <= 0) { toast({ title: "Costo inválido", description: "Ingresa el costo total de la compra.", variant: "destructive" }); return; }
    createExpenseMutation.mutate(
      {
        amount: amt,
        category: "inventario",
        inventoryItemId: pItemId,
        quantity: qty,
        paymentMethod: pMethod,
        supplier: pSupplier.trim() || null,
        date: new Date(`${pDate}T12:00:00`).toISOString(),
      },
      {
        onSuccess: () => {
          setPurchaseOpen(false);
          setPItemId(""); setPQty("1"); setPAmount(""); setPSupplier("");
          toast({ title: "Compra registrada", description: "Se sumó al inventario." });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header title="Gastos" subtitle="Control de egresos: compras, proveedores, operativos y personales" />

        <div className="p-6 space-y-6">
          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setPurchaseOpen(true)} className="gap-2">
              <ShoppingCart className="h-4 w-4" /> Compra de inventario
            </Button>
            <Button variant="outline" onClick={() => setExpenseOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Registrar gasto
            </Button>
          </div>

          {/* Period filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  aria-pressed={period === p.key}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    period === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === "custom" && (
              <div className="flex items-center gap-2">
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto text-sm" />
                <span className="text-slate-400 text-sm">a</span>
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto text-sm" />
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 flex items-center space-x-2">
                <TrendingDown className="h-8 w-8 text-red-600" />
                <div>
                  <p className="text-sm font-medium text-slate-600">Total egresos</p>
                  <p className="text-2xl font-bold text-slate-900">${total.toFixed(2)} MXN</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-600">Negocio</p>
                <p className="text-2xl font-bold text-slate-900">${business.toFixed(2)} MXN</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-600">Personal</p>
                <p className="text-2xl font-bold text-slate-900">${personal.toFixed(2)} MXN</p>
              </CardContent>
            </Card>
          </div>

          {/* By-category breakdown */}
          {byCategory.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-slate-600 mb-2">Desglose por categoría</p>
                <div className="space-y-1">
                  {byCategory.sort((a, b) => b.total - a.total).map((c) => (
                    <div key={c.category} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{expenseCategoryLabel(c.category)}</span>
                      <span className="font-medium text-slate-800">${c.total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* List */}
          {expensesLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => (<Card key={i} className="animate-pulse"><CardContent className="p-4 h-16" /></Card>))}</div>
          ) : inPeriod.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-slate-500">No hay gastos en este periodo.</CardContent></Card>
          ) : (
            <div className="space-y-2">
              {inPeriod.map((e) => (
                <Card key={e.id}>
                  <CardContent className="p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={CATEGORY_COLORS[e.category] || "bg-slate-100 text-slate-800"}>
                          {expenseCategoryLabel(e.category)}
                        </Badge>
                        <span className="font-medium text-slate-900 truncate">
                          {e.inventoryItem ? `${e.inventoryItem.name} × ${e.quantity}` : (e.description || "—")}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        {e.date ? new Date(e.date).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : ""}
                        {e.supplier ? ` · ${e.supplier}` : ""}
                        {e.paymentMethod ? ` · ${paymentMethodLabel(e.paymentMethod)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-lg font-semibold text-slate-900">${Number(e.amount).toFixed(2)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteExpenseMutation.mutate(e.id)}
                        disabled={deleteExpenseMutation.isPending}
                        title="Eliminar"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Quick expense dialog */}
      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar gasto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Monto (MXN)</Label>
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUICK_CATEGORIES.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Método de pago</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descripción</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Cena, renta, luz..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Proveedor (opcional)</Label>
                <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancelar</Button>
              <Button onClick={submitExpense} disabled={createExpenseMutation.isPending}>Guardar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Inventory purchase dialog */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Compra de inventario</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Producto</Label>
              <Select value={pItemId} onValueChange={setPItemId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un producto" /></SelectTrigger>
                <SelectContent>
                  {(inventory ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name} · stock: {p.currentStock ?? 0}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">¿Producto nuevo? Créalo primero en Inventario.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Cantidad</Label>
                <Input type="number" min={1} value={pQty} onChange={(e) => setPQty(e.target.value)} />
              </div>
              <div>
                <Label>Costo total (MXN)</Label>
                <Input type="number" min={0} step="0.01" value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Método de pago</Label>
                <Select value={pMethod} onValueChange={setPMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha</Label>
                <Input type="date" value={pDate} onChange={(e) => setPDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Proveedor (opcional)</Label>
              <Input value={pSupplier} onChange={(e) => setPSupplier(e.target.value)} placeholder="Ej. Royal Canin, Imver..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPurchaseOpen(false)}>Cancelar</Button>
              <Button onClick={submitPurchase} disabled={createExpenseMutation.isPending} className="gap-2">
                <ShoppingCart className="h-4 w-4" /> Registrar compra
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
