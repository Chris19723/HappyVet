import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Receipt, User, Calendar, DollarSign } from "lucide-react";
import type { InvoiceWithDetails } from "@shared/schema";
import { format } from "date-fns";

export default function Billing() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: invoices, isLoading: invoicesLoading, error } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/invoices"],
    retry: false,
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PUT", `/api/invoices/${id}`, { 
        status,
        paymentDate: status === 'paid' ? new Date().toISOString() : null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Success",
        description: "Invoice updated successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const filteredInvoices = invoices?.filter((invoice: InvoiceWithDetails) =>
    invoice.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.owner.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.owner.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    invoice.patient?.name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStatusColor = (status: string) => {
    const colors = {
      pending: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      overdue: "bg-red-100 text-red-800",
      cancelled: "bg-gray-100 text-gray-800",
    };
    return colors[status as keyof typeof colors] || colors.pending;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      pending: "Pendiente",
      paid: "Pagada",
      overdue: "Vencida",
      cancelled: "Cancelada",
    };
    return labels[status as keyof typeof labels] || status;
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Facturación" 
          subtitle="Gestión de facturas y pagos"
        />
        
        <div className="p-6">
          {/* Search and Actions */}
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

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Receipt className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Total Facturas</p>
                    <p className="text-2xl font-bold text-slate-900">{invoices?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Total Ingresos</p>
                    <p className="text-2xl font-bold text-slate-900">
                      ${invoices?.reduce((sum: number, inv: InvoiceWithDetails) => 
                        inv.status === 'paid' ? sum + Number(inv.totalAmount) : sum, 0
                      ).toFixed(2) || '0.00'} MXN
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Receipt className="h-8 w-8 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Pendientes</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {invoices?.filter((inv: InvoiceWithDetails) => inv.status === 'pending').length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Receipt className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Vencidas</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {invoices?.filter((inv: InvoiceWithDetails) => inv.status === 'overdue').length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Invoices List */}
          {invoicesLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-600">Error loading invoices. Please try again.</p>
              </CardContent>
            </Card>
          ) : filteredInvoices.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Receipt className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No invoices found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? "No invoices match your search criteria." : "Invoices will appear here when generated."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredInvoices.map((invoice: InvoiceWithDetails) => (
                <Card key={invoice.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-3">
                          <h3 className="text-lg font-semibold text-slate-900">
                            {invoice.invoiceNumber}
                          </h3>
                          <Badge className={getStatusColor(invoice.status ?? "")}>
                            {getStatusLabel(invoice.status ?? "")}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
                          <div>
                            <div className="flex items-center space-x-2 mb-2">
                              <User className="h-4 w-4" />
                              <span>
                                {invoice.owner.firstName} {invoice.owner.lastName}
                              </span>
                            </div>
                            
                            {invoice.patient && (
                              <div className="flex items-center space-x-2 mb-2">
                                <span className="font-medium">Paciente:</span>
                                <span>{invoice.patient.name}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center space-x-2">
                              <Calendar className="h-4 w-4" />
                              <span>
                                {invoice.issueDate ? format(new Date(invoice.issueDate), "PPP") : "—"}
                              </span>
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
                                  <span>
                                    {item.description} x{item.quantity}
                                  </span>
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
                      
                      <div className="flex flex-col space-y-2 ml-4">
                        {invoice.status === 'pending' && (
                          <Button
                            size="sm"
                            onClick={() => updateInvoiceMutation.mutate({ 
                              id: invoice.id, 
                              status: 'paid' 
                            })}
                            disabled={updateInvoiceMutation.isPending}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Marcar Pagada
                          </Button>
                        )}
                        
                        {invoice.status === 'pending' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateInvoiceMutation.mutate({ 
                              id: invoice.id, 
                              status: 'overdue' 
                            })}
                            disabled={updateInvoiceMutation.isPending}
                          >
                            Marcar Vencida
                          </Button>
                        )}
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.print()}
                        >
                          Imprimir
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
