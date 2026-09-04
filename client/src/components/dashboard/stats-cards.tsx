import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Heart, AlertTriangle } from "lucide-react";
import RevenueCard from "@/components/dashboard/revenue-card";

interface StatsCardsProps {
  stats?: {
    todayAppointments: number;
    activePatients: number;
    monthlyRevenue: number;
    lowStock: number;
  };
  isLoading: boolean;
}

type StatCard = {
  title: string;
  value: number | string;
  change: string;
  icon: typeof Calendar;
  color: string;
  bgColor: string;
  changeColor?: string;
};

function StatCardView({ stat }: { stat: StatCard }) {
  const Icon = stat.icon;
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-600">{stat.title}</p>
            <p className="text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
            <p className={`text-sm mt-1 ${stat.changeColor || "text-success"}`}>
              {stat.change}
            </p>
          </div>
          <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
            <Icon className={`w-6 h-6 ${stat.color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-4 bg-slate-200 rounded mb-2"></div>
              <div className="h-8 bg-slate-200 rounded mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-2/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const appointmentsCard: StatCard = {
    title: "Citas Hoy",
    value: stats?.todayAppointments ?? 0,
    change: "+3 vs ayer",
    icon: Calendar,
    color: "text-primary",
    bgColor: "bg-primary/10",
  };

  const patientsCard: StatCard = {
    title: "Pacientes Activos",
    value: stats?.activePatients ?? 0,
    change: "+15 este mes",
    icon: Heart,
    color: "text-secondary",
    bgColor: "bg-secondary/10",
  };

  const lowStockCard: StatCard = {
    title: "Stock Bajo",
    value: stats?.lowStock ?? 0,
    change: "Requiere atención",
    icon: AlertTriangle,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
    changeColor: "text-destructive",
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCardView stat={appointmentsCard} />
      <StatCardView stat={patientsCard} />
      <RevenueCard />
      <StatCardView stat={lowStockCard} />
    </div>
  );
}
