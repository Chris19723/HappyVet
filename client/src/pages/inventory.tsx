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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Package, AlertTriangle, TrendingDown } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertInventoryItemSchema, type InventoryItem, type InsertInventoryItem } from "@shared/schema";
import type { z } from "zod";

const formSchema = insertInventoryItemSchema.extend({
  expiryDate: insertInventoryItemSchema.shape.expiryDate.optional(),
});

type FormData = z.infer<typeof formSchema>;

export default function Inventory() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "",
      currentStock: 0,
      minStock: 5,
      unitPrice: "0",
      supplier: "",
      isActive: true,
    },
  });

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

  useEffect(() => {
    if (selectedItem) {
      form.reset({
        name: selectedItem.name,
        description: selectedItem.description || "",
        category: selectedItem.category || "",
        currentStock: selectedItem.currentStock,
        minStock: selectedItem.minStock,
        unitPrice: selectedItem.unitPrice?.toString() || "0",
        supplier: selectedItem.supplier || "",
        expiryDate: selectedItem.expiryDate || undefined,
        isActive: selectedItem.isActive,
      });
    } else {
      form.reset({
        name: "",
        description: "",
        category: "",
        currentStock: 0,
        minStock: 5,
        unitPrice: "0",
        supplier: "",
        isActive: true,
      });
    }
  }, [selectedItem, form]);

  const { data: inventoryItems, isLoading: itemsLoading, error } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
    retry: false,
  });

  const { data: lowStockItems, error: lowStockError } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/low-stock"],
    retry: false,
  });

  useEffect(() => {
    const requestError = error ?? lowStockError;
    if (!requestError || !isUnauthorizedError(requestError)) return;

    toast({
      title: "Sesión expirada",
      description: "Inicia sesión nuevamente para cargar el inventario.",
      variant: "destructive",
    });
    const redirectTimer = setTimeout(() => {
      window.location.href = "/api/login";
    }, 500);

    return () => clearTimeout(redirectTimer);
  }, [error, lowStockError, toast]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      await apiRequest("POST", "/api/inventory", data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      trackEvent("inventory_item_created", {
        initial_stock: variables.currentStock ?? 0,
        has_supplier: Boolean(variables.supplier?.trim()),
      });
      toast({
        title: "Success",
        description: "Inventory item created successfully",
      });
      setIsFormOpen(false);
      setSelectedItem(null);
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
        description: "Failed to create inventory item",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      await apiRequest("PUT", `/api/inventory/${selectedItem!.id}`, data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      trackEvent("inventory_item_updated", {
        current_stock: variables.currentStock ?? 0,
        has_supplier: Boolean(variables.supplier?.trim()),
      });
      toast({
        title: "Success",
        description: "Inventory item updated successfully",
      });
      setIsFormOpen(false);
      setSelectedItem(null);
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
        description: "Failed to update inventory item",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inventory/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/low-stock"] });
      trackEvent("inventory_item_deleted");
      toast({
        title: "Success",
        description: "Inventory item deleted successfully",
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
        description: "Failed to delete inventory item",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    const submitData: InsertInventoryItem = {
      ...data,
      unitPrice: data.unitPrice,
    };

    if (selectedItem) {
      updateMutation.mutate(submitData);
    } else {
      createMutation.mutate(submitData);
    }
  };

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

  const filteredItems = inventoryItems?.filter((item: InventoryItem) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.supplier?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getStockStatus = (item: InventoryItem) => {
    const currentStock = item.currentStock ?? 0;
    const minStock = item.minStock ?? 0;
    if (currentStock <= 0) {
      return { label: "Sin Stock", color: "bg-red-100 text-red-800" };
    } else if (currentStock <= minStock) {
      return { label: "Stock Bajo", color: "bg-yellow-100 text-yellow-800" };
    }
    return { label: "En Stock", color: "bg-green-100 text-green-800" };
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Inventario" 
          subtitle="Gestión de medicamentos y suministros"
        />
        
        <div className="p-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <Package className="h-8 w-8 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Total Productos</p>
                    <p className="text-2xl font-bold text-slate-900">{inventoryItems?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-8 w-8 text-yellow-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Stock Bajo</p>
                    <p className="text-2xl font-bold text-slate-900">{lowStockItems?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <TrendingDown className="h-8 w-8 text-red-600" />
                  <div>
                    <p className="text-sm font-medium text-slate-600">Sin Stock</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {inventoryItems?.filter((item: InventoryItem) => (item.currentStock ?? 0) <= 0).length || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar productos por nombre, categoría o proveedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Producto
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {selectedItem ? "Editar Producto" : "Nuevo Producto"}
                  </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nombre *</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="category"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Categoría</FormLabel>
                            <FormControl>
                              <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                                <SelectTrigger>
                                  <SelectValue placeholder="Seleccionar categoría" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="medicamentos">Medicamentos</SelectItem>
                                  <SelectItem value="vacunas">Vacunas</SelectItem>
                                  <SelectItem value="instrumental">Instrumental</SelectItem>
                                  <SelectItem value="consumibles">Consumibles</SelectItem>
                                  <SelectItem value="alimentos">Alimentos</SelectItem>
                                  <SelectItem value="otros">Otros</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Descripción</FormLabel>
                          <FormControl>
                            <Input {...field} value={field.value ?? ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="currentStock"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stock Actual *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="minStock"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Stock Mínimo *</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                value={field.value ?? ""}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="unitPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Precio Unitario (MXN)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                {...field}
                                value={field.value ?? ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="supplier"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Proveedor</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value ?? ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="expiryDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fecha de Caducidad</FormLabel>
                          <FormControl>
                            <Input 
                              type="date" 
                              {...field}
                              value={field.value || ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex justify-end space-x-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsFormOpen(false);
                          setSelectedItem(null);
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={createMutation.isPending || updateMutation.isPending}
                      >
                        {selectedItem ? "Actualizar" : "Crear"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          {/* Inventory Items */}
          {itemsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
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
                <p className="text-slate-600">Error loading inventory items. Please try again.</p>
              </CardContent>
            </Card>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Package className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No inventory items found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? "No items match your search criteria." : "Start by adding your first inventory item."}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Item
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item: InventoryItem) => {
                const stockStatus = getStockStatus(item);
                return (
                  <Card key={item.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{item.name}</CardTitle>
                        <Badge className={stockStatus.color}>
                          {stockStatus.label}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="space-y-3">
                        {item.description && (
                          <p className="text-sm text-slate-600">{item.description}</p>
                        )}
                        
                        {item.category && (
                          <p className="text-sm">
                            <span className="font-medium">Categoría:</span> {item.category}
                          </p>
                        )}
                        
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">Stock:</span>
                          <span className={(item.currentStock ?? 0) <= (item.minStock ?? 0) ? "text-red-600 font-medium" : ""}>
                            {item.currentStock} / {item.minStock} mín.
                          </span>
                        </div>
                        
                        {item.unitPrice && (
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">Precio:</span>
                            <span>${Number(item.unitPrice).toFixed(2)} MXN</span>
                          </div>
                        )}
                        
                        {item.supplier && (
                          <p className="text-sm">
                            <span className="font-medium">Proveedor:</span> {item.supplier}
                          </p>
                        )}
                        
                        {item.expiryDate && (
                          <p className="text-sm">
                            <span className="font-medium">Caducidad:</span> {new Date(item.expiryDate).toLocaleDateString()}
                          </p>
                        )}

                        <div className="flex justify-end space-x-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedItem(item);
                              setIsFormOpen(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteMutation.mutate(item.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
