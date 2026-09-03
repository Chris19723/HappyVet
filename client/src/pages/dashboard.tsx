import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AppointmentWithDetails } from "@shared/schema";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import StatsCards from "@/components/dashboard/stats-cards";
import AppointmentsToday from "@/components/dashboard/appointments-today";
import QuickActions from "@/components/dashboard/quick-actions";
import RecentActivity from "@/components/dashboard/recent-activity";
import InventoryAlerts from "@/components/dashboard/inventory-alerts";

export default function Dashboard() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  // Redirect to home if not authenticated
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

  const { data: stats, isLoading: statsLoading } = useQuery<{
    todayAppointments: number;
    activePatients: number;
    monthlyRevenue: number;
    lowStock: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    retry: false,
  });

  const { data: todayAppointments, isLoading: appointmentsLoading } = useQuery<
    AppointmentWithDetails[]
  >({
    queryKey: ["/api/dashboard/today-appointments"],
    retry: false,
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

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Dashboard" 
          subtitle="Resumen general de la clínica veterinaria"
        />
        
        <div className="p-6 space-y-6">
          <StatsCards stats={stats} isLoading={statsLoading} />
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <AppointmentsToday 
                appointments={todayAppointments} 
                isLoading={appointmentsLoading} 
              />
            </div>
            
            <div className="space-y-6">
              <QuickActions />
              <RecentActivity />
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <InventoryAlerts />
          </div>
        </div>
      </main>
    </div>
  );
}
