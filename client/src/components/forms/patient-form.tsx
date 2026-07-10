import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ObjectUploader } from "@/components/ObjectUploader";
import { insertPatientSchema, type PatientWithOwner, type InsertPatient } from "@shared/schema";
import { Camera, User } from "lucide-react";
import type { z } from "zod";
import type { UploadResult } from "@uppy/core";

const formSchema = insertPatientSchema.extend({
  birthDate: insertPatientSchema.shape.birthDate.optional(),
  weight: insertPatientSchema.shape.weight.optional(),
});

type FormData = z.infer<typeof formSchema>;

interface PatientFormProps {
  patient?: PatientWithOwner | null;
  onSuccess: () => void;
}

export default function PatientForm({ patient, onSuccess }: PatientFormProps) {
  const { toast } = useToast();
  const [patientPhotoUrl, setPatientPhotoUrl] = useState<string | null>(null);
  const [ownerPhotoUrl, setOwnerPhotoUrl] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<any>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      species: "",
      breed: "",
      color: "",
      gender: "",
      ownerId: "",
      notes: "",
    },
  });

  const { data: owners } = useQuery({
    queryKey: ["/api/owners"],
    retry: false,
  });

  useEffect(() => {
    if (patient) {
      form.reset({
        name: patient.name,
        species: patient.species,
        breed: patient.breed || "",
        color: patient.color || "",
        gender: patient.gender || "",
        birthDate: patient.birthDate || undefined,
        weight: patient.weight || undefined,
        ownerId: patient.ownerId,
        notes: patient.notes || "",
      });
    }
  }, [patient, form]);

  const createMutation = useMutation({
    mutationFn: async (data: InsertPatient) => {
      await apiRequest("POST", "/api/patients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({
        title: "Success",
        description: "Patient created successfully",
      });
      onSuccess();
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
        description: "Failed to create patient",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: InsertPatient) => {
      await apiRequest("PUT", `/api/patients/${patient!.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Success",
        description: "Patient updated successfully",
      });
      onSuccess();
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
        description: "Failed to update patient",
        variant: "destructive",
      });
    },
  });

  // Photo upload handlers
  const getUploadParameters = async () => {
    const response = await apiRequest("POST", "/api/objects/upload");
    const { uploadURL } = await response.json();
    return {
      method: "PUT" as const,
      url: uploadURL,
    };
  };

  const handlePatientPhotoComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0] as any;
      setPatientPhotoUrl(uploadedFile.uploadURL || null);
    }
  };

  const handleOwnerPhotoComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0] as any;
      setOwnerPhotoUrl(uploadedFile.uploadURL || null);
    }
  };

  const savePhotos = async (patientId: string, ownerId: string) => {
    try {
      // Save patient photo if uploaded
      if (patientPhotoUrl) {
        await apiRequest("PUT", "/api/patient-photos", {
          patientId,
          photoURL: patientPhotoUrl,
        });
      }

      // Save owner photo if uploaded
      if (ownerPhotoUrl) {
        await apiRequest("PUT", "/api/owner-photos", {
          ownerId,
          photoURL: ownerPhotoUrl,
        });
      }
    } catch (error) {
      console.error("Error saving photos:", error);
      toast({
        title: "Warning",
        description: "Patient saved but there was an issue saving photos",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: FormData) => {
    const submitData: InsertPatient = {
      ...data,
      weight: data.weight ? data.weight.toString() : null,
    };

    if (patient) {
      updateMutation.mutate(submitData, {
        onSuccess: () => {
          // Save photos after successful update
          if (patientPhotoUrl || ownerPhotoUrl) {
            savePhotos(patient.id, data.ownerId);
          }
        }
      });
    } else {
      // For new patients, we need to get the created patient ID first
      try {
        const response = await apiRequest("POST", "/api/patients", submitData);
        const newPatient = await response.json();
        
        // Save photos if any were uploaded
        if (patientPhotoUrl || ownerPhotoUrl) {
          await savePhotos(newPatient.id, data.ownerId);
        }

        queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        toast({
          title: "Success",
          description: "Patient created successfully",
        });
        onSuccess();
      } catch (error) {
        if (isUnauthorizedError(error as Error)) {
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
          description: "Failed to create patient",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre del Paciente *</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Max, Bella, Rocky" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="ownerId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Propietario *</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar propietario" />
                    </SelectTrigger>
                    <SelectContent>
                      {(owners as any[])?.map((owner: any) => (
                        <SelectItem key={owner.id} value={owner.id}>
                          {owner.firstName} {owner.lastName}
                        </SelectItem>
                      )) || []}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="species"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Especie *</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar especie" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="perro">Perro</SelectItem>
                      <SelectItem value="gato">Gato</SelectItem>
                      <SelectItem value="ave">Ave</SelectItem>
                      <SelectItem value="reptil">Reptil</SelectItem>
                      <SelectItem value="roedor">Roedor</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="breed"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Raza</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Golden Retriever" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input placeholder="Ej: Dorado, Negro" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="gender"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Género</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar género" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="macho">Macho</SelectItem>
                      <SelectItem value="hembra">Hembra</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="birthDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Fecha de Nacimiento</FormLabel>
                <FormControl>
                  <Input 
                    type="date" 
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="weight"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Peso (kg)</FormLabel>
                <FormControl>
                  <Input 
                    type="number" 
                    step="0.1"
                    placeholder="Ej: 25.5"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notas</FormLabel>
              <FormControl>
                <Textarea 
                  placeholder="Información adicional sobre el paciente..."
                  {...field}
                  value={field.value || ""}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Photo Upload Sections */}
        <div className="space-y-6 p-4 border rounded-lg bg-muted/50">
          <h3 className="text-lg font-medium mb-4">Fotografías</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Patient Photo Upload */}
            <div className="space-y-2">
              <FormLabel>Foto del Paciente</FormLabel>
              <div className="flex flex-col items-center space-y-3">
                {patientPhotoUrl ? (
                  <div className="relative">
                    <img 
                      src={patientPhotoUrl} 
                      alt="Foto del paciente" 
                      className="w-32 h-32 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => setPatientPhotoUrl(null)}
                    >
                      ×
                    </Button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <Camera className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760} // 10MB
                  onGetUploadParameters={getUploadParameters}
                  onComplete={handlePatientPhotoComplete}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    <span>{patientPhotoUrl ? "Cambiar foto" : "Subir foto del paciente"}</span>
                  </div>
                </ObjectUploader>
              </div>
            </div>

            {/* Owner Photo Upload */}
            <div className="space-y-2">
              <FormLabel>Foto del Propietario</FormLabel>
              <div className="flex flex-col items-center space-y-3">
                {ownerPhotoUrl ? (
                  <div className="relative">
                    <img 
                      src={ownerPhotoUrl} 
                      alt="Foto del propietario" 
                      className="w-32 h-32 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute -top-2 -right-2"
                      onClick={() => setOwnerPhotoUrl(null)}
                    >
                      ×
                    </Button>
                  </div>
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                    <User className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                
                <ObjectUploader
                  maxNumberOfFiles={1}
                  maxFileSize={10485760} // 10MB
                  onGetUploadParameters={getUploadParameters}
                  onComplete={handleOwnerPhotoComplete}
                  buttonClassName="w-full"
                >
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4" />
                    <span>{ownerPhotoUrl ? "Cambiar foto" : "Subir foto del propietario"}</span>
                  </div>
                </ObjectUploader>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2">
          <Button type="button" variant="outline" onClick={onSuccess}>
            Cancelar
          </Button>
          <Button 
            type="submit" 
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            {patient ? "Actualizar" : "Crear"} Paciente
          </Button>
        </div>
      </form>
    </Form>
  );
}
