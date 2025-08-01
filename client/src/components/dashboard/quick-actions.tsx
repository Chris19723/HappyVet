import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Users, Heart, FileText, Receipt } from "lucide-react";
import PatientForm from "@/components/forms/patient-form";
import OwnerForm from "@/components/forms/owner-form";
import AppointmentForm from "@/components/forms/appointment-form";

export default function QuickActions() {
  const [activeDialog, setActiveDialog] = useState<string | null>(null);

  const actions = [
    {
      id: "patient",
      label: "Nuevo Paciente",
      icon: Heart,
      color: "bg-primary/10 text-primary",
    },
    {
      id: "owner",
      label: "Nuevo Propietario",
      icon: Users,
      color: "bg-secondary/10 text-secondary",
    },
    {
      id: "appointment",
      label: "Nueva Cita",
      icon: FileText,
      color: "bg-purple-100 text-purple-600",
    },
  ];

  const renderDialog = () => {
    switch (activeDialog) {
      case "patient":
        return (
          <Dialog open={true} onOpenChange={() => setActiveDialog(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuevo Paciente</DialogTitle>
              </DialogHeader>
              <PatientForm onSuccess={() => setActiveDialog(null)} />
            </DialogContent>
          </Dialog>
        );
      case "owner":
        return (
          <Dialog open={true} onOpenChange={() => setActiveDialog(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nuevo Propietario</DialogTitle>
              </DialogHeader>
              <OwnerForm onSuccess={() => setActiveDialog(null)} />
            </DialogContent>
          </Dialog>
        );
      case "appointment":
        return (
          <Dialog open={true} onOpenChange={() => setActiveDialog(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nueva Cita</DialogTitle>
              </DialogHeader>
              <AppointmentForm onSuccess={() => setActiveDialog(null)} />
            </DialogContent>
          </Dialog>
        );
      default:
        return null;
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-slate-900">Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.id}
                variant="ghost"
                className="w-full justify-start p-3 h-auto"
                onClick={() => setActiveDialog(action.id)}
              >
                <div className={`w-8 h-8 ${action.color} rounded-lg flex items-center justify-center mr-3`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-medium">{action.label}</span>
              </Button>
            );
          })}
        </CardContent>
      </Card>
      {renderDialog()}
    </>
  );
}
