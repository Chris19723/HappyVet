import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Heart, DollarSign, AlertTriangle } from "lucide-react";

interface StatsCardsProps {
  stats?: {
    todayAppointments: number;
    activePatients: number;
    monthlyRevenue: number;
    lowStock: number;
  };
  isLoading: boolean;
}

type Kpi = {
  title: string;
  value: string;
  sublabel: string;
  icon: typeof Calendar;
  tint: string; // icon chip
  sublabelClass?: string;
};

function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = kpi.icon;
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-500">{kpi.title}</p>
            <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums tracking-tight">{kpi.value}</p>
            <p className={`text-xs mt-1 ${kpi.sublabelClass ?? "text-slate-400"}`}>{kpi.sublabel}</p>
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${kpi.tint}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-5">
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-3"></div>
              <div className="h-8 bg-slate-200 rounded w-2/3 mb-2"></div>
              <div className="h-3 bg-slate-200 rounded w-1/3"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const lowStock = stats?.lowStock ?? 0;
  const kpis: Kpi[] = [
    {
      title: "Citas hoy",
      value: String(stats?.todayAppointments ?? 0),
      sublabel: "Programadas para hoy",
      icon: Calendar,
      tint: "bg-primary/10 text-primary",
    },
    {
      title: "Pacientes activos",
      value: String(stats?.activePatients ?? 0),
      sublabel: "En la clínica",
      icon: Heart,
      tint: "bg-secondary/10 text-secondary",
    },
    {
      title: "Ingresos del mes",
      value: `$${(Number(stats?.monthlyRevenue) || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sublabel: "Cobrado este mes",
      icon: DollarSign,
      tint: "bg-emerald-100 text-emerald-700",
    },
    {
      title: "Stock bajo",
      value: String(lowStock),
      sublabel: lowStock > 0 ? "Requiere atención" : "Todo en orden",
      icon: AlertTriangle,
      tint: lowStock > 0 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-500",
      sublabelClass: lowStock > 0 ? "text-red-600 font-medium" : "text-slate-400",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.title} kpi={kpi} />
      ))}
    </div>
  );
}
