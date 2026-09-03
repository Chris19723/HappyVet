import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  Clock,
  FileText,
  HeartPulse,
  Mail,
  MapPin,
  Phone,
  Scale,
  Stethoscope,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AppointmentWithDetails,
  MedicalRecordWithDetails,
  PatientWithOwner,
} from "@shared/schema";

const appointmentStatus: Record<string, string> = {
  scheduled: "Programada",
  confirmed: "Confirmada",
  "in-progress": "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
};

const statusStyles: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  "in-progress": "bg-amber-100 text-amber-800",
  completed: "bg-slate-100 text-slate-700",
  cancelled: "bg-red-100 text-red-800",
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function displayValue(value: string | null | undefined) {
  return value || "No registrado";
}

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Sesión expirada",
        description: "Inicia sesión nuevamente para consultar la ficha.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
    }
  }, [authLoading, isAuthenticated, toast]);

  const {
    data: patient,
    isLoading: patientLoading,
    error: patientError,
  } = useQuery<PatientWithOwner>({
    queryKey: [`/api/patients/${id}`],
    enabled: !!id && isAuthenticated,
    retry: false,
  });

  const {
    data: records = [],
    isLoading: recordsLoading,
  } = useQuery<MedicalRecordWithDetails[]>({
    queryKey: [`/api/patients/${id}/medical-records`],
    enabled: !!id && isAuthenticated,
    retry: false,
  });

  const {
    data: allAppointments = [],
    isLoading: appointmentsLoading,
  } = useQuery<AppointmentWithDetails[]>({
    queryKey: ["/api/appointments"],
    enabled: isAuthenticated,
    retry: false,
  });

  if (authLoading || patientLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (patientError || !patient) {
    return (
      <div className="min-h-screen flex bg-slate-50">
        <Sidebar />
        <main className="flex-1">
          <Header title="Ficha del paciente" subtitle="Expediente clínico integral" />
          <div className="p-6">
            <Card>
              <CardContent className="p-10 text-center">
                <FileText className="mx-auto mb-4 h-10 w-10 text-slate-400" />
                <h2 className="text-lg font-semibold">No se pudo abrir la ficha</h2>
                <p className="mt-1 text-sm text-slate-500">El paciente no existe o no está disponible.</p>
                <Button className="mt-5" onClick={() => setLocation("/patients")}>
                  Volver a pacientes
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const appointments = allAppointments
    .filter((appointment) => appointment.patientId === patient.id)
    .sort(
      (a, b) =>
        new Date(b.appointmentDate).getTime() - new Date(a.appointmentDate).getTime(),
    );

  const completedAppointments = appointments.filter(
    (appointment) => appointment.status === "completed",
  ).length;

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header title="Ficha del paciente" subtitle="Expediente clínico integral" />

        <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
          <Button variant="ghost" className="-ml-2" onClick={() => setLocation("/patients")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a pacientes
          </Button>

          <Card className="overflow-hidden border-0 shadow-sm">
            <div className="h-24 bg-gradient-to-r from-blue-600 to-cyan-500" />
            <CardContent className="relative px-5 pb-6 sm:px-8">
              <Avatar className="-mt-14 h-28 w-28 border-4 border-white shadow-md">
                <AvatarImage src={patient.photoUrl || undefined} className="object-cover" />
                <AvatarFallback className="bg-blue-100 text-2xl font-bold text-blue-700">
                  {initials(patient.name)}
                </AvatarFallback>
              </Avatar>
              <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                      {patient.name}
                    </h1>
                    <Badge variant="secondary" className="capitalize">
                      {patient.species}
                    </Badge>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {displayValue(patient.breed)} · Propietario: {patient.owner.firstName}{" "}
                    {patient.owner.lastName}
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="rounded-lg bg-blue-50 px-4 py-2 text-center">
                    <p className="text-xl font-bold text-blue-700">{appointments.length}</p>
                    <p className="text-xs text-blue-700">Consultas</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 px-4 py-2 text-center">
                    <p className="text-xl font-bold text-emerald-700">{records.length}</p>
                    <p className="text-xs text-emerald-700">Expedientes</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_1.7fr]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <HeartPulse className="h-5 w-5 text-blue-600" />
                    Datos clínicos
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Especie</p>
                    <p className="font-medium capitalize">{patient.species}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Raza</p>
                    <p className="font-medium">{displayValue(patient.breed)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Género</p>
                    <p className="font-medium capitalize">{displayValue(patient.gender)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Color</p>
                    <p className="font-medium">{displayValue(patient.color)}</p>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-slate-500">
                      <Scale className="h-3.5 w-3.5" /> Peso
                    </p>
                    <p className="font-medium">
                      {patient.weight ? `${patient.weight} kg` : "No registrado"}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Nacimiento</p>
                    <p className="font-medium">
                      {patient.birthDate
                        ? format(new Date(`${patient.birthDate}T00:00:00`), "dd MMM yyyy", {
                            locale: es,
                          })
                        : "No registrado"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-slate-500">Microchip</p>
                    <p className="font-medium">{displayValue(patient.microchipId)}</p>
                  </div>
                  {patient.notes && (
                    <div className="col-span-2 border-t pt-4">
                      <p className="text-slate-500">Notas generales</p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700">{patient.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5 text-blue-600" />
                    Propietario
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 flex items-center gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={patient.owner.photoUrl || undefined} className="object-cover" />
                      <AvatarFallback>{initials(`${patient.owner.firstName} ${patient.owner.lastName}`)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">
                        {patient.owner.firstName} {patient.owner.lastName}
                      </p>
                      <p className="text-sm text-slate-500">Responsable del paciente</p>
                    </div>
                  </div>
                  <div className="space-y-3 text-sm">
                    <p className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-slate-400" />
                      {displayValue(patient.owner.phone)}
                    </p>
                    <p className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" />
                      {displayValue(patient.owner.email)}
                    </p>
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                      {[patient.owner.address, patient.owner.city, patient.owner.postalCode]
                        .filter(Boolean)
                        .join(", ") || "Dirección no registrada"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-lg">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-blue-600" />
                      Historial de consultas
                    </span>
                    <Badge variant="outline">{completedAppointments} completadas</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {appointmentsLoading ? (
                    <p className="text-sm text-slate-500">Cargando consultas...</p>
                  ) : appointments.length === 0 ? (
                    <div className="py-8 text-center">
                      <CalendarDays className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                      <p className="font-medium">Sin consultas registradas</p>
                      <p className="text-sm text-slate-500">
                        Las citas del paciente aparecerán aquí.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {appointments.map((appointment) => (
                        <div key={appointment.id} className="py-4 first:pt-0 last:pb-0">
                          <div className="flex flex-col justify-between gap-2 sm:flex-row">
                            <div>
                              <p className="font-semibold text-slate-900">{appointment.reason}</p>
                              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="h-3.5 w-3.5" />
                                  {format(new Date(appointment.appointmentDate), "dd MMM yyyy, HH:mm", {
                                    locale: es,
                                  })}
                                </span>
                                <span className="flex items-center gap-1">
                                  <Clock className="h-3.5 w-3.5" />
                                  {appointment.duration || 30} min
                                </span>
                              </div>
                            </div>
                            <Badge
                              className={statusStyles[appointment.status || "scheduled"]}
                            >
                              {appointmentStatus[appointment.status || "scheduled"] ||
                                appointment.status}
                            </Badge>
                          </div>
                          {appointment.notes && (
                            <p className="mt-2 text-sm text-slate-600">{appointment.notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <ClipboardList className="h-5 w-5 text-blue-600" />
                    Expediente médico
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {recordsLoading ? (
                    <p className="text-sm text-slate-500">Cargando expediente...</p>
                  ) : records.length === 0 ? (
                    <div className="py-8 text-center">
                      <Stethoscope className="mx-auto mb-3 h-9 w-9 text-slate-300" />
                      <p className="font-medium">Sin registros clínicos</p>
                      <p className="text-sm text-slate-500">
                        Los diagnósticos y tratamientos aparecerán aquí.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {records.map((record) => (
                        <div key={record.id} className="rounded-xl border bg-white p-4">
                          <div className="flex flex-col justify-between gap-2 sm:flex-row">
                            <div>
                              <p className="font-semibold">
                                {record.diagnosis || "Consulta médica"}
                              </p>
                              <p className="mt-1 text-sm text-slate-500">
                                {format(new Date(record.date || record.createdAt || new Date()), "dd MMM yyyy, HH:mm", {
                                  locale: es,
                                })}
                              </p>
                            </div>
                            <p className="text-sm text-slate-500">
                              Dr. {record.veterinarian.firstName} {record.veterinarian.lastName}
                            </p>
                          </div>
                          <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                            {record.treatment && (
                              <div className="rounded-lg bg-blue-50 p-3">
                                <p className="font-medium text-blue-900">Tratamiento</p>
                                <p className="mt-1 text-blue-800">{record.treatment}</p>
                              </div>
                            )}
                            {record.prescription && (
                              <div className="rounded-lg bg-emerald-50 p-3">
                                <p className="font-medium text-emerald-900">Prescripción</p>
                                <p className="mt-1 text-emerald-800">{record.prescription}</p>
                              </div>
                            )}
                          </div>
                          {record.notes && (
                            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">
                              {record.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}