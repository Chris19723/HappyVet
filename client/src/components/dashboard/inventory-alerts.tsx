import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { InventoryItem } from "@shared/schema";

export default function InventoryAlerts() {
  const { data: lowStockItems, isLoading } = useQuery({
    queryKey: ["/api/inventory/low-stock"],
    retry: false,
  });

  const getAlertLevel = (item: InventoryItem) => {
    if (item.currentStock <= 0) {
      return { label: "Crítico", color: "bg-red-100 text-red-800 border-red-200" };
    } else if (item.currentStock <= item.minStock / 2) {
      return { label: "Muy Bajo", color: "bg-orange-100 text-orange-800 border-orange-200" };
    }
    return { label: "Bajo", color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alertas de Inventario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse p-4 bg-slate-50 rounded-lg">
                <div className="h-4 bg-slate-200 rounded mb-2"></div>
                <div className="h-3 bg-slate-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-slate-900">Alertas de Inventario</CardTitle>
      </CardHeader>
      <CardContent>
        {!lowStockItems || lowStockItems.length === 0 ? (
          <div className="text-center py-8">
            <AlertTriangle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No hay alertas de inventario</p>
            <p className="text-sm text-slate-500">Todos los productos tienen stock suficiente</p>
          </div>
        ) : (
          <div className="space-y-4">
            {lowStockItems.map((item: InventoryItem) => {
              const alertLevel = getAlertLevel(item);
              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-lg border ${alertLevel.color.includes('red') ? 'bg-red-50 border-red-200' : 
                    alertLevel.color.includes('orange') ? 'bg-orange-50 border-orange-200' : 
                    'bg-yellow-50 border-yellow-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-900">{item.name}</p>
                      <p className="text-sm text-slate-600">
                        Stock actual: {item.currentStock} unidades
                      </p>
                      {item.category && (
                        <p className="text-xs text-slate-500">Categoría: {item.category}</p>
                      )}
                    </div>
                    <Badge className={alertLevel.color}>
                      {alertLevel.label}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
