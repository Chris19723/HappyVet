import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DollarSign } from "lucide-react";

type Period = "day" | "week" | "month" | "custom";

interface RevenueResponse {
  period: string;
  from: string;
  to: string;
  total: number;
  label: string;
}

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "custom", label: "Rango" },
];

export default function RevenueCard() {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const customReady = period === "custom" && Boolean(from) && Boolean(to);
  const queryUrl =
    period === "custom"
      ? customReady
        ? `/api/dashboard/revenue?from=${from}&to=${to}`
        : null
      : `/api/dashboard/revenue?period=${period}`;

  const { data, isLoading, isError } = useQuery<RevenueResponse>({
    queryKey: [queryUrl],
    enabled: Boolean(queryUrl),
    retry: false,
  });

  const value = `$${(Number(data?.total) || 0).toFixed(2)} MXN`;

  const subtitle =
    period === "custom" && !customReady
      ? "Elige un rango de fechas"
      : isError
        ? "No se pudo cargar"
        : data?.label ?? "";

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-600">Ingresos</p>
            <p className="text-3xl font-bold text-slate-900 mt-1" data-testid="revenue-value">
              {queryUrl && isLoading ? "…" : value}
            </p>
            <p className="text-sm mt-1 text-slate-500 truncate">{subtitle}</p>
          </div>
          <div className="w-12 h-12 bg-warning/10 rounded-lg flex items-center justify-center shrink-0">
            <DollarSign className="w-6 h-6 text-warning" />
          </div>
        </div>

        <div className="mt-4 inline-flex rounded-lg bg-slate-100 p-0.5">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              aria-pressed={period === p.key}
              data-testid={`revenue-period-${p.key}`}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p.key
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === "custom" && (
          <div className="mt-3 flex items-center gap-2">
            <Input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="h-8 text-xs"
              data-testid="revenue-from"
            />
            <span className="text-slate-400 text-xs">a</span>
            <Input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="h-8 text-xs"
              data-testid="revenue-to"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
