import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Edit, Trash2, Receipt, User, Calendar, DollarSign, Package, Tag } from "lucide-react";
import type { InvoiceWithDetails, Treatment, InsertTreatment } from "@shared/schema";
import { format } from "date-fns";

const CATEGORIES = [
  "Consulta",
  "Vacunación",
  "Cirugía",
  "Estética Canina",
  "Diagnóstico",
  "Estudios de Laboratorio",
  "Medicamento",
  "Otro",
];

interface TreatmentFormState {
  name: string;
  description: string;
  price: string;
  category: string;
  duration: string;
}

const emptyForm = (): TreatmentFormState => ({
  name: "", description: "", price: "", category: "", duration: "",
});

export default function Billing() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("q") ?? "";
  });
  const [treatmentSearch, setTreatmentSearch] = useState("");

  const [treatmentDialogOpen, setTreatmentDialogOpen] = useState(false);
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [treatmentForm, setTreatmentForm] = useState<TreatmentFormState>(emptyForm());

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: invoices, isLoading: invoicesLoading, error } = useQuery({
    queryKey: ["/api/invoices"],
    retry: false,
  });

  const { data: treatments, isLoading: treatmentsLoading } = useQuery<Treatment[]>({
    queryKey: ["/api/treatments"],
    retry: false,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PUT", `/api/invoices/${id}`, {
        status,
        paymentDate: status === "paid" ? new Date().toISOString() : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Factura actualizada" });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "No se pudo actualizar la factura.", variant: "destructive" });
    },
  });

  const deleteInvoiceMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/invoices/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Factura eliminada correctamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo eliminar la factura.", variant: "destructive" });
    },
  });

  const createTreatmentMutation = useMutation({
    mutationFn: async (data: InsertTreatment) => {
      const res = await apiRequest("POST", "/api/treatments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatments"] });
      toast({ title: "Servicio creado correctamente." });
      closeTreatmentDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear el servicio.", variant: "destructive" });
    },
  });

  const updateTreatmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertTreatment> }) => {
      await apiRequest("PUT", `/api/treatments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatments"] });
      toast({ title: "Servicio actualizado correctamente." });
      closeTreatmentDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo actualizar el servicio.", variant: "destructive" });
    },
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/treatments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/treatments"] });
      toast({ title: "Servicio desactivado." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo desactivar el servicio.", variant: "destructive" });
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

  const filteredInvoices = (invoices as InvoiceWithDetails[] | undefined)?.filter((invoice) =>
    invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.owner.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.owner.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (invoice.patient?.name ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const filteredTreatments = treatments?.filter((t) =>
    t.name.toLowerCase().includes(treatmentSearch.toLowerCase()) ||
    (t.category ?? "").toLowerCase().includes(treatmentSearch.toLowerCase())
  ) || [];

  const getInvoiceStatusColor = (status: string | null) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      overdue: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status ?? "pending"] || colors.pending;
  };

  const getInvoiceStatusLabel = (status: string | null) => {
    const labels: Record<string, string> = {
      pending: "Pendiente",
      paid: "Pagada",
      overdue: "Vencida",
      cancelled: "Cancelada",
    };
    return labels[status ?? "pending"] || status || "Pendiente";
  };

  const openNewTreatment = () => {
    setEditingTreatment(null);
    setTreatmentForm(emptyForm());
    setTreatmentDialogOpen(true);
  };

  const openEditTreatment = (t: Treatment) => {
    setEditingTreatment(t);
    setTreatmentForm({
      name: t.name,
      description: t.description ?? "",
      price: String(t.price),
      category: t.category ?? "",
      duration: t.duration ? String(t.duration) : "",
    });
    setTreatmentDialogOpen(true);
  };

  const closeTreatmentDialog = () => {
    setTreatmentDialogOpen(false);
    setEditingTreatment(null);
    setTreatmentForm(emptyForm());
  };

  const handleTreatmentSubmit = () => {
    if (!treatmentForm.name.trim() || !treatmentForm.price.trim()) {
      toast({ title: "Campos requeridos", description: "Nombre y precio son obligatorios.", variant: "destructive" });
      return;
    }
    const price = parseFloat(treatmentForm.price);
    if (isNaN(price) || price < 0) {
      toast({ title: "Precio inválido", description: "Ingresa un precio válido.", variant: "destructive" });
      return;
    }
    const data: InsertTreatment = {
      name: treatmentForm.name.trim(),
      description: treatmentForm.description.trim() || null,
      price: price.toFixed(2),
      category: treatmentForm.category || null,
      duration: treatmentForm.duration ? parseInt(treatmentForm.duration) : null,
      isActive: true,
    };
    if (editingTreatment) {
      updateTreatmentMutation.mutate({ id: editingTreatment.id, data });
    } else {
      createTreatmentMutation.mutate(data);
    }
  };

  const isPending = createTreatmentMutation.isPending || updateTreatmentMutation.isPending;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header title="Facturación" subtitle="Gestión de facturas y catálogo de servicios" />

        <div className="p-6">
          <Tabs defaultValue="facturas">
            <TabsList className="mb-6">
              <TabsTrigger value="facturas">
                <Receipt className="h-4 w-4 mr-2" />
                Facturas
              </TabsTrigger>
              <TabsTrigger value="servicios">
                <Package className="h-4 w-4 mr-2" />
                Servicios
              </TabsTrigger>
            </TabsList>

            {/* ── FACTURAS TAB ── */}
            <TabsContent value="facturas">
              {/* Search */}
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar facturas por número, cliente o paciente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card>
                  <CardContent className="p-4 flex items-center space-x-2">
                    <Receipt className="h-8 w-8 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-600">Total Facturas</p>
                      <p className="text-2xl font-bold text-slate-900">{(invoices as InvoiceWithDetails[])?.length || 0}</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center space-x-2">
                    <DollarSign className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-600">Ingresos Cobrados</p>
                      <p className="text-2xl font-bold text-slate-900">
                        ${(invoices as InvoiceWithDetails[])?.reduce((sum, inv) =>
                          inv.status === "paid" ? sum + Number(inv.totalAmount) : sum, 0
                        ).toFixed(2) || "0.00"} MXN
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center space-x-2">
                    <Receipt className="h-8 w-8 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-600">Pendientes</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {(invoices as InvoiceWithDetails[])?.filter((inv) => inv.status === "pending").length || 0}
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 flex items-center space-x-2">
                    <Receipt className="h-8 w-8 text-red-600" />
                    <div>
                      <p className="text-sm font-medium text-slate-600">Vencidas</p>
                      <p className="text-2xl font-bold text-slate-900">
                        {(invoices as InvoiceWithDetails[])?.filter((inv) => inv.status === "overdue").length || 0}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Invoices list */}
              {invoicesLoading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-6">
                        <div className="h-4 bg-slate-200 rounded mb-2 w-1/3"></div>
                        <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : error ? (
                <Card><CardContent className="p-6 text-center text-slate-600">Error al cargar facturas.</CardContent></Card>
              ) : filteredInvoices.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center">
                    <Receipt className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-1">Sin facturas</h3>
                    <p className="text-slate-500 text-sm">
                      {searchTerm ? "Sin resultados para la búsqueda." : "Las facturas aparecerán aquí cuando se generen desde las citas."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {filteredInvoices.map((invoice) => (
                    <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
                      <CardContent className="p-6">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-3">
                              <h3 className="text-lg font-semibold text-slate-900">{invoice.invoiceNumber}</h3>
                              <Badge className={getInvoiceStatusColor(invoice.status)}>
                                {getInvoiceStatusLabel(invoice.status)}
                              </Badge>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                              <div>
                                <div className="flex items-center space-x-2 mb-2">
                                  <User className="h-4 w-4" />
                                  <span>{invoice.owner.firstName} {invoice.owner.lastName}</span>
                                </div>
                                {invoice.patient && (
                                  <div className="flex items-center space-x-2 mb-2">
                                    <span className="font-medium">Paciente:</span>
                                    <span>{invoice.patient.name}</span>
                                  </div>
                                )}
                                <div className="flex items-center space-x-2">
                                  <Calendar className="h-4 w-4" />
                                  <span>{format(new Date(invoice.issueDate ?? new Date()), "PPP")}</span>
                                </div>
                              </div>
                              <div>
                                <div className="mb-2">
                                  <span className="font-medium">Subtotal:</span>
                                  <span className="ml-2">${Number(invoice.subtotal).toFixed(2)} MXN</span>
                                </div>
                                {Number(invoice.taxAmount) > 0 && (
                                  <div className="mb-2">
                                    <span className="font-medium">IVA:</span>
                                    <span className="ml-2">${Number(invoice.taxAmount).toFixed(2)} MXN</span>
                                  </div>
                                )}
                                <div className="text-lg font-semibold">
                                  <span className="font-medium">Total:</span>
                                  <span className="ml-2">${Number(invoice.totalAmount).toFixed(2)} MXN</span>
                                </div>
                              </div>
                            </div>

                            {invoice.items.length > 0 && (
                              <div className="mt-4">
                                <h4 className="font-medium text-slate-900 mb-2">Servicios:</h4>
                                <div className="space-y-1">
                                  {invoice.items.map((item) => (
                                    <div key={item.id} className="flex justify-between text-sm">
                                      <span>{item.description} × {item.quantity}</span>
                                      <span>${Number(item.totalPrice).toFixed(2)} MXN</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {invoice.notes && (
                              <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-700">{invoice.notes}</p>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col space-y-2 ml-4 shrink-0">
                            {invoice.status === "pending" && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => updateInvoiceMutation.mutate({ id: invoice.id, status: "paid" })}
                                  disabled={updateInvoiceMutation.isPending}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  Marcar Pagada
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => updateInvoiceMutation.mutate({ id: invoice.id, status: "overdue" })}
                                  disabled={updateInvoiceMutation.isPending}
                                >
                                  Marcar Vencida
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => window.print()}>
                              Imprimir
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-red-600 hover:text-red-700"
                            disabled={deleteInvoiceMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`¿Eliminar la factura ${invoice.invoiceNumber}? Esta acción no se puede deshacer.`)) {
                                deleteInvoiceMutation.mutate(invoice.id);
                              }
                            }}
                            aria-label={`Eliminar factura ${invoice.invoiceNumber}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── SERVICIOS TAB ── */}
            <TabsContent value="servicios">
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Buscar servicios por nombre o categoría..."
                    value={treatmentSearch}
                    onChange={(e) => setTreatmentSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button onClick={openNewTreatment} className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Servicio
                </Button>
              </div>

              {treatmentsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <CardContent className="p-4">
                        <div className="h-4 bg-slate-200 rounded mb-2 w-1/3"></div>
                        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredTreatments.length === 0 ? (
                <Card>
                  <CardContent className="p-10 text-center">
                    <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-slate-700 mb-1">Sin servicios</h3>
                    <p className="text-slate-500 text-sm mb-4">
                      {treatmentSearch ? "Sin resultados." : "Agrega servicios para usarlos en la generación de facturas."}
                    </p>
                    {!treatmentSearch && (
                      <Button onClick={openNewTreatment}>
                        <Plus className="h-4 w-4 mr-2" />
                        Nuevo Servicio
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTreatments.map((treatment) => (
                    <Card key={treatment.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-slate-900">{treatment.name}</h3>
                            {treatment.category && (
                              <div className="flex items-center gap-1 mt-1">
                                <Tag className="h-3 w-3 text-slate-400" />
                                <span className="text-xs text-slate-500">{treatment.category}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => openEditTreatment(treatment)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                              onClick={() => deleteTreatmentMutation.mutate(treatment.id)}
                              disabled={deleteTreatmentMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {treatment.description && (
                          <p className="text-sm text-slate-500 mb-3 line-clamp-2">{treatment.description}</p>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-lg font-bold text-primary">
                            ${Number(treatment.price).toFixed(2)} MXN
                          </span>
                          {treatment.duration && (
                            <span className="text-xs text-slate-400">{treatment.duration} min</span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </main>

      {/* Treatment create/edit dialog */}
      <Dialog open={treatmentDialogOpen} onOpenChange={(open) => { if (!open) closeTreatmentDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTreatment ? "Editar Servicio" : "Nuevo Servicio"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="t-name">Nombre *</Label>
              <Input
                id="t-name"
                placeholder="Ej: Consulta general, Vacuna antirrábica..."
                value={treatmentForm.name}
                onChange={(e) => setTreatmentForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="t-price">Precio (MXN) *</Label>
                <Input
                  id="t-price"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={treatmentForm.price}
                  onChange={(e) => setTreatmentForm((f) => ({ ...f, price: e.target.value }))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="t-duration">Duración (min)</Label>
                <Input
                  id="t-duration"
                  type="number"
                  min={0}
                  placeholder="30"
                  value={treatmentForm.duration}
                  onChange={(e) => setTreatmentForm((f) => ({ ...f, duration: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="t-category">Categoría</Label>
              <Select
                value={treatmentForm.category || "__none__"}
                onValueChange={(v) => setTreatmentForm((f) => ({ ...f, category: v === "__none__" ? "" : v }))}
              >
                <SelectTrigger id="t-category" className="mt-1">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin categoría</SelectItem>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="t-desc">Descripción</Label>
              <Textarea
                id="t-desc"
                placeholder="Descripción del servicio (opcional)..."
                value={treatmentForm.description}
                onChange={(e) => setTreatmentForm((f) => ({ ...f, description: e.target.value }))}
                className="mt-1"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeTreatmentDialog} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleTreatmentSubmit} disabled={isPending}>
                {isPending ? "Guardando..." : editingTreatment ? "Actualizar" : "Crear Servicio"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
