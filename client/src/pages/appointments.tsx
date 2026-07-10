import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Plus, Search, Edit, Trash2,
  Calendar as CalendarIcon, Clock, User,
  ChevronLeft, ChevronRight, Receipt, ClipboardList,
} from "lucide-react";
import AppointmentForm from "@/components/forms/appointment-form";
import ServicesInvoiceModal from "@/components/forms/services-invoice-modal";
import type { AppointmentWithDetails, InvoiceWithDetails } from "@shared/schema";
import {
  format, isSameDay, addDays, subDays, isToday,
  startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  isWithinInterval,
} from "date-fns";
import { es } from "date-fns/locale";

type ViewMode = "day" | "week" | "month";

export default function Appointments() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [servicesAppointment, setServicesAppointment] = useState<AppointmentWithDetails | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
      setTimeout(() => { window.location.href = "/api/login"; }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: appointments, isLoading: appointmentsLoading, error } = useQuery({
    queryKey: ["/api/appointments"],
    retry: false,
  });

  const { data: invoices } = useQuery<InvoiceWithDetails[]>({
    queryKey: ["/api/invoices"],
    retry: false,
  });

  // Build appointment → invoice map for badge display
  const appointmentInvoiceMap = new Map<string, InvoiceWithDetails>();
  invoices?.forEach((inv) => {
    if (inv.appointmentId) appointmentInvoiceMap.set(inv.appointmentId, inv);
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/appointments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/today-appointments"] });
      toast({ title: "Cita eliminada", description: "La cita se eliminó correctamente." });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Unauthorized", description: "You are logged out. Logging in again...", variant: "destructive" });
        setTimeout(() => { window.location.href = "/api/login"; }, 500);
        return;
      }
      toast({ title: "Error", description: "No se pudo eliminar la cita.", variant: "destructive" });
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

  // Compute range start/end based on view mode
  const rangeStart =
    viewMode === "day"
      ? anchorDate
      : viewMode === "week"
      ? startOfWeek(anchorDate, { locale: es })
      : startOfMonth(anchorDate);

  const rangeEnd =
    viewMode === "day"
      ? anchorDate
      : viewMode === "week"
      ? endOfWeek(anchorDate, { locale: es })
      : endOfMonth(anchorDate);

  const goBack = () => {
    if (viewMode === "day") setAnchorDate((d) => subDays(d, 1));
    else if (viewMode === "week") setAnchorDate((d) => subWeeks(d, 1));
    else setAnchorDate((d) => subMonths(d, 1));
  };
  const goForward = () => {
    if (viewMode === "day") setAnchorDate((d) => addDays(d, 1));
    else if (viewMode === "week") setAnchorDate((d) => addWeeks(d, 1));
    else setAnchorDate((d) => addMonths(d, 1));
  };
  const goToday = () => setAnchorDate(new Date());

  const todayInRange =
    viewMode === "day"
      ? isToday(anchorDate)
      : isWithinInterval(new Date(), { start: rangeStart, end: rangeEnd });

  const periodLabel =
    viewMode === "day"
      ? (() => {
          const s = format(anchorDate, "EEEE d 'de' MMMM, yyyy", { locale: es });
          return s.charAt(0).toUpperCase() + s.slice(1);
        })()
      : viewMode === "week"
      ? `${format(rangeStart, "d 'de' MMM", { locale: es })} – ${format(rangeEnd, "d 'de' MMM, yyyy", { locale: es })}`
      : (() => {
          const s = format(anchorDate, "MMMM yyyy", { locale: es });
          return s.charAt(0).toUpperCase() + s.slice(1);
        })();

  const prevLabel = viewMode === "day" ? "Anterior" : viewMode === "week" ? "Semana anterior" : "Mes anterior";
  const nextLabel = viewMode === "day" ? "Siguiente" : viewMode === "week" ? "Semana siguiente" : "Mes siguiente";

  const filteredAppointments = (appointments as AppointmentWithDetails[] | undefined)?.filter((appt) => {
    const apptDate = new Date(appt.appointmentDate);
    const matchesPeriod =
      viewMode === "day"
        ? isSameDay(apptDate, anchorDate)
        : isWithinInterval(apptDate, { start: rangeStart, end: rangeEnd });
    const matchesSearch =
      appt.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.patient.owner.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.patient.owner.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      appt.reason.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesPeriod && matchesSearch;
  }) || [];

  filteredAppointments.sort(
    (a, b) => new Date(a.appointmentDate).getTime() - new Date(b.appointmentDate).getTime()
  );

  const getStatusColor = (status: string | null) => {
    const colors: Record<string, string> = {
      scheduled: "bg-blue-100 text-blue-800",
      confirmed: "bg-green-100 text-green-800",
      "in-progress": "bg-yellow-100 text-yellow-800",
      completed: "bg-gray-100 text-gray-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status ?? "scheduled"] || colors.scheduled;
  };

  const getStatusLabel = (status: string | null) => {
    const labels: Record<string, string> = {
      scheduled: "Programada",
      confirmed: "Confirmada",
      "in-progress": "En Progreso",
      completed: "Completada",
      cancelled: "Cancelada",
    };
    return labels[status ?? "scheduled"] || status || "Programada";
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const emptyMessage =
    searchTerm
      ? "Sin resultados para la búsqueda"
      : viewMode === "day"
      ? "Sin citas para este día"
      : viewMode === "week"
      ? "Sin citas para esta semana"
      : "Sin citas para este mes";

  const emptySubMessage =
    searchTerm
      ? "Prueba con otros términos o limpia el filtro de texto."
      : `No hay citas programadas para ${periodLabel}.`;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header title="Citas" subtitle="Gestión de citas y programación de consultas" />

        <div className="p-6">
          {/* Search and New appointment */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar por paciente, propietario o motivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) setSelectedAppointment(null);
            }}>
              <DialogTrigger asChild>
                <Button className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Nueva Cita
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{selectedAppointment ? "Editar Cita" : "Nueva Cita"}</DialogTitle>
                </DialogHeader>
                <AppointmentForm
                  appointment={selectedAppointment}
                  onSuccess={() => { setIsFormOpen(false); setSelectedAppointment(null); }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* View mode toggle */}
          <div className="flex gap-1 mb-3">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode(mode)}
              >
                {mode === "day" ? "Día" : mode === "week" ? "Semana" : "Mes"}
              </Button>
            ))}
          </div>

          {/* Date navigation bar */}
          <Card className="mb-6">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={goBack}>
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline ml-1">{prevLabel}</span>
                  </Button>

                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        className="font-semibold text-slate-800 hover:bg-slate-100 px-2 sm:px-3 text-sm sm:text-base gap-2"
                      >
                        <CalendarIcon className="h-4 w-4 text-slate-500 shrink-0" />
                        <span>{periodLabel}</span>
                        {todayInRange && (
                          <Badge className="bg-primary text-white text-xs py-0 px-1.5">Hoy</Badge>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={anchorDate}
                        onSelect={(date) => {
                          if (date) { setAnchorDate(date); setCalendarOpen(false); }
                        }}
                        initialFocus
                        locale={es}
                      />
                    </PopoverContent>
                  </Popover>

                  <Button variant="outline" size="sm" onClick={goForward}>
                    <span className="hidden sm:inline mr-1">{nextLabel}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {!todayInRange && (
                  <Button variant="secondary" size="sm" onClick={goToday}>
                    Hoy
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Appointments list */}
          {appointmentsLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-slate-200 rounded mb-2 w-1/2"></div>
                    <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-600">Error al cargar las citas. Intenta de nuevo.</p>
              </CardContent>
            </Card>
          ) : filteredAppointments.length === 0 ? (
            <Card>
              <CardContent className="p-10 text-center">
                <CalendarIcon className="h-12 w-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-700 mb-1">{emptyMessage}</h3>
                <p className="text-slate-500 mb-4 text-sm">{emptySubMessage}</p>
                {!searchTerm && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agendar cita
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                {filteredAppointments.length} cita{filteredAppointments.length !== 1 ? "s" : ""} en este período
              </p>
              {filteredAppointments.map((appointment) => {
                const linkedInvoice = appointmentInvoiceMap.get(appointment.id);
                return (
                  <Card key={appointment.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4 flex-1 min-w-0">
                          <Avatar className="h-12 w-12 shrink-0">
                            <AvatarImage src={appointment.patient.photoUrl || undefined} />
                            <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                              {getInitials(appointment.patient.name)}
                            </AvatarFallback>
                          </Avatar>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-2 mb-2">
                              <h3 className="text-lg font-semibold text-slate-900">
                                {appointment.patient.name}
                              </h3>
                              <Badge className={getStatusColor(appointment.status)}>
                                {getStatusLabel(appointment.status)}
                              </Badge>
                              {linkedInvoice && (
                                <button
                                  onClick={() => setLocation(`/billing?q=${encodeURIComponent(linkedInvoice.invoiceNumber)}`)}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                >
                                  <Receipt className="h-3 w-3" />
                                  {linkedInvoice.invoiceNumber}
                                </button>
                              )}
                            </div>

                            <div className="space-y-1 text-sm text-slate-600">
                              <div className="flex items-center space-x-2">
                                <User className="h-4 w-4 shrink-0" />
                                <span>
                                  {appointment.patient.owner.firstName} {appointment.patient.owner.lastName}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                <CalendarIcon className="h-4 w-4 shrink-0" />
                                <span>
                                  {format(new Date(appointment.appointmentDate), "EEEE d 'de' MMMM", { locale: es })}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                <Clock className="h-4 w-4 shrink-0" />
                                <span>
                                  {format(new Date(appointment.appointmentDate), "HH:mm")}
                                  {appointment.duration && ` · ${appointment.duration} min`}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3">
                              <p className="font-medium text-slate-900">Motivo:</p>
                              <p className="text-slate-600">{appointment.reason}</p>
                            </div>

                            {appointment.notes && (
                              <div className="mt-2">
                                <p className="font-medium text-slate-900">Notas:</p>
                                <p className="text-slate-600">{appointment.notes}</p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4 shrink-0">
                          {!linkedInvoice && appointment.status !== "cancelled" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => setServicesAppointment(appointment)}
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              Agregar Servicios
                            </Button>
                          )}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setSelectedAppointment(appointment); setIsFormOpen(true); }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteMutation.mutate(appointment.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* Services & Invoice modal */}
      {servicesAppointment && (
        <ServicesInvoiceModal
          appointment={servicesAppointment}
          open={!!servicesAppointment}
          onClose={() => setServicesAppointment(null)}
          onSuccess={(invoiceNumber) => {
            setServicesAppointment(null);
            toast({
              title: "Factura generada",
              description: `Se creó la factura ${invoiceNumber}. La cita fue marcada como Completada.`,
            });
          }}
        />
      )}
    </div>
  );
}
