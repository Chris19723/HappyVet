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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Heart } from "lucide-react";
import PatientForm from "@/components/forms/patient-form";
import type { PatientWithOwner } from "@shared/schema";

export default function Patients() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientWithOwner | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

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

  const { data: patients, isLoading: patientsLoading, error } = useQuery<PatientWithOwner[]>({
    queryKey: ["/api/patients"],
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Success",
        description: "Patient deleted successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
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
      toast({
        title: "Error",
        description: "Failed to delete patient",
        variant: "destructive",
      });
    },
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

  const filteredPatients = patients?.filter((patient: PatientWithOwner) =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.owner.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.owner.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.species.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.breed?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getSpeciesColor = (species: string) => {
    const colors = {
      perro: "bg-blue-100 text-blue-800",
      gato: "bg-purple-100 text-purple-800",
      ave: "bg-green-100 text-green-800",
      otro: "bg-gray-100 text-gray-800",
    };
    return colors[species.toLowerCase() as keyof typeof colors] || colors.otro;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Pacientes" 
          subtitle="Gestión de mascotas y sus registros médicos"
        />
        
        <div className="p-6">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar pacientes por nombre, propietario, especie..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Paciente
                </Button>
              </DialogTrigger>
              <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {selectedPatient ? "Editar Paciente" : "Nuevo Paciente"}
                  </DialogTitle>
                </DialogHeader>
                <PatientForm
                  patient={selectedPatient}
                  onSuccess={() => {
                    setIsFormOpen(false);
                    setSelectedPatient(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Patients Grid */}
          {patientsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="h-4 bg-slate-200 rounded mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : error ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-slate-600">Error loading patients. Please try again.</p>
              </CardContent>
            </Card>
          ) : filteredPatients.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Heart className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No patients found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? "No patients match your search criteria." : "Start by adding your first patient."}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Patient
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPatients.map((patient: PatientWithOwner) => (
                <Card
                  key={patient.id}
                  className="cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all"
                  onClick={() => setLocation(`/patients/${patient.id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      setLocation(`/patients/${patient.id}`);
                    }
                  }}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={patient.photoUrl || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                          {getInitials(patient.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{patient.name}</CardTitle>
                        <p className="text-sm text-slate-600">
                          {patient.owner.firstName} {patient.owner.lastName}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge className={getSpeciesColor(patient.species)}>
                          {patient.species}
                        </Badge>
                        <span className="text-sm text-slate-600">
                          {patient.breed}
                        </span>
                      </div>
                      
                      <div className="text-sm space-y-1">
                        {patient.gender && (
                          <p><span className="font-medium">Género:</span> {patient.gender}</p>
                        )}
                        {patient.birthDate && (
                          <p><span className="font-medium">Nacimiento:</span> {new Date(patient.birthDate).toLocaleDateString()}</p>
                        )}
                        {patient.weight && (
                          <p><span className="font-medium">Peso:</span> {patient.weight} kg</p>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPatient(patient);
                            setIsFormOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteMutation.mutate(patient.id);
                          }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
