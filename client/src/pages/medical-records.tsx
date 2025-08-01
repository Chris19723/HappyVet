import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, FileText, User, Calendar } from "lucide-react";
import type { MedicalRecordWithDetails } from "@shared/schema";
import { format } from "date-fns";

export default function MedicalRecords() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");

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

  const { data: medicalRecords, isLoading: recordsLoading, error } = useQuery({
    queryKey: ["/api/medical-records"],
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

  const filteredRecords = medicalRecords?.filter((record: MedicalRecordWithDetails) =>
    record.patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.patient.owner.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.patient.owner.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.diagnosis?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.treatment?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Historiales Médicos" 
          subtitle="Registros de diagnósticos y tratamientos"
        />
        
        <div className="p-6">
          {/* Search */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar historiales por paciente, propietario, diagnóstico..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Medical Records List */}
          {recordsLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
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
                <p className="text-slate-600">Error loading medical records. Please try again.</p>
              </CardContent>
            </Card>
          ) : filteredRecords.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <FileText className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No medical records found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? "No medical records match your search criteria." : "Medical records will appear here as appointments are completed."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredRecords.map((record: MedicalRecordWithDetails) => (
                <Card key={record.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={record.patient.photoUrl || undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-400 to-blue-600 text-white">
                          {getInitials(record.patient.name)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {record.patient.name}
                        </CardTitle>
                        <div className="flex items-center space-x-4 text-sm text-slate-600 mt-1">
                          <div className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span>
                              {record.patient.owner.firstName} {record.patient.owner.lastName}
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>
                              {format(new Date(record.date), "PPP")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="space-y-4">
                      {record.diagnosis && (
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-2">Diagnóstico</h4>
                          <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">
                            {record.diagnosis}
                          </p>
                        </div>
                      )}
                      
                      {record.treatment && (
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-2">Tratamiento</h4>
                          <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">
                            {record.treatment}
                          </p>
                        </div>
                      )}
                      
                      {record.prescription && (
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-2">Prescripción</h4>
                          <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">
                            {record.prescription}
                          </p>
                        </div>
                      )}
                      
                      {record.notes && (
                        <div>
                          <h4 className="font-semibold text-slate-900 mb-2">Notas Adicionales</h4>
                          <p className="text-slate-700 bg-slate-50 p-3 rounded-lg">
                            {record.notes}
                          </p>
                        </div>
                      )}
                      
                      <div className="text-sm text-slate-500 pt-2 border-t">
                        Atendido por: Dr. {record.veterinarian.firstName} {record.veterinarian.lastName}
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
