import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";
import { expenseCategoryLabel } from "@shared/expense";

type Period = "day" | "week" | "month" | "custom";

const PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "Día" },
  { key: "week", label: "Semana" },
  { key: "month", label: "Mes" },
  { key: "custom", label: "Rango" },
];

interface RevenueResponse {
  total: number;
  label: string;
}
interface ExpenseResponse {
  total: number;
  business: number;
  personal: number;
  byCategory: { category: string; total: number }[];
  label: string;
}

function money(n: number) {
  return `$${(Number(n) || 0).toFixed(2)}`;
}

export default function FinancePanel() {
  const [period, setPeriod] = useState<Period>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const customReady = period === "custom" && Boolean(from) && Boolean(to);
  const qs =
    period === "custom"
      ? customReady
        ? `from=${from}&to=${to}`
        : null
      : `period=${period}`;

  const revenueQuery = useQuery<RevenueResponse>({
    queryKey: [qs ? `/api/dashboard/revenue?${qs}` : null],
    enabled: Boolean(qs),
    retry: false,
  });
  const expenseQuery = useQuery<ExpenseResponse>({
    queryKey: [qs ? `/api/dashboard/expenses?${qs}` : null],
    enabled: Boolean(qs),
    retry: false,
  });

  const income = revenueQuery.data?.total ?? 0;
  const businessExpenses = expenseQuery.data?.business ?? 0;
  const personal = expenseQuery.data?.personal ?? 0;
  const balance = income - businessExpenses;
  const label = revenueQuery.data?.label ?? expenseQuery.data?.label ?? "";
  const loading = Boolean(qs) && (revenueQuery.isLoading || expenseQuery.isLoading);

  const byCategory = (expenseQuery.data?.byCategory ?? [])
    .slice()
    .sort((a, b) => b.total - a.total);

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Resumen financiero</h3>
            <p className="text-sm text-slate-500">{period === "custom" && !customReady ? "Elige un rango" : label}</p>
          </div>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                data-testid={`finance-period-${p.key}`}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  period === p.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2 mb-4">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="h-9 w-auto text-sm" />
            <span className="text-slate-400 text-sm">a</span>
            <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="h-9 w-auto text-sm" />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <TrendingUp className="h-4 w-4 text-green-600" /> Ingresos
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "…" : `${money(income)} MXN`}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <TrendingDown className="h-4 w-4 text-red-600" /> Egresos (negocio)
            </div>
            <p className="text-2xl font-bold text-slate-900 mt-1">{loading ? "…" : `${money(businessExpenses)} MXN`}</p>
          </div>
          <div className={`rounded-lg border p-4 ${balance >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
            <div className="flex items-center gap-2 text-slate-600 text-sm">
              <Scale className="h-4 w-4 text-slate-700" /> Balance
            </div>
            <p className={`text-2xl font-bold mt-1 ${balance >= 0 ? "text-green-700" : "text-red-700"}`}>
              {loading ? "…" : `${money(balance)} MXN`}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-slate-500">
            Gastos personales: <span className="font-medium text-slate-700">{money(personal)} MXN</span>
            <span className="text-slate-400"> (aparte del balance)</span>
          </span>
          {byCategory.length > 0 && (
            <span className="text-slate-400 text-xs">
              {byCategory.map((c) => `${expenseCategoryLabel(c.category)}: $${c.total.toFixed(0)}`).join(" · ")}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
