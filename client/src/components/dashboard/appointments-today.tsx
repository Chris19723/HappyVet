import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import type { AppointmentWithDetails } from "@shared/schema";

interface AppointmentsTodayProps {
  appointments?: AppointmentWithDetails[];
  isLoading: boolean;
}

export default function AppointmentsToday({ appointments, isLoading }: AppointmentsTodayProps) {
  const getStatusColor = (status: string) => {
    const colors = {
      scheduled: "bg-blue-100 text-blue-800",
      confirmed: "bg-green-100 text-green-800",
      "in-progress": "bg-yellow-100 text-yellow-800",
      completed: "bg-gray-100 text-gray-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status as keyof typeof colors] || colors.scheduled;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      scheduled: "Programada",
      confirmed: "Confirmada",
      "in-progress": "En Progreso",
      completed: "Completada",
      cancelled: "Cancelada",
    };
    return labels[status as keyof typeof labels] || status;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Citas de Hoy</CardTitle>
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">Citas de Hoy</CardTitle>
          <button className="text-sm text-primary hover:text-primary/80">Ver todas</button>
        </div>
      </CardHeader>
      <CardContent>
        {!appointments || appointments.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-600">No hay citas programadas para hoy</p>
          </div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appointment) => (
              <div key={appointment.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <div className="flex items-center space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={appointment.patient.photoUrl || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                      {getInitials(appointment.patient.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-slate-900">{appointment.patient.name}</p>
                    <p className="text-sm text-slate-600">
                      {appointment.patient.owner.firstName} {appointment.patient.owner.lastName}
                    </p>
                    <p className="text-xs text-slate-500">{appointment.reason}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-900">
                    {format(new Date(appointment.appointmentDate), "HH:mm")}
                  </p>
                  <Badge className={getStatusColor(appointment.status ?? "")}>
                    {getStatusLabel(appointment.status ?? "")}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
