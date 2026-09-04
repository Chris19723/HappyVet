import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, Edit, Trash2, Users, Phone, Mail, MapPin } from "lucide-react";
import OwnerForm from "@/components/forms/owner-form";
import type { Owner } from "@shared/schema";

export default function Owners() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<Owner | null>(null);
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

  const { data: owners, isLoading: ownersLoading, error } = useQuery<Owner[]>({
    queryKey: ["/api/owners"],
    retry: false,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/owners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owners"] });
      toast({
        title: "Success",
        description: "Owner deleted successfully",
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
        description: "Failed to delete owner",
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

  const filteredOwners = owners?.filter((owner: Owner) =>
    `${owner.firstName} ${owner.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    owner.phone?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Propietarios" 
          subtitle="Gestión de clientes y sus datos de contacto"
        />
        
        <div className="p-6">
          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar propietarios por nombre, email o teléfono..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button className="whitespace-nowrap">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo Propietario
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {selectedOwner ? "Editar Propietario" : "Nuevo Propietario"}
                  </DialogTitle>
                </DialogHeader>
                <OwnerForm
                  owner={selectedOwner}
                  onSuccess={() => {
                    setIsFormOpen(false);
                    setSelectedOwner(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* Owners Grid */}
          {ownersLoading ? (
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
                <p className="text-slate-600">Error loading owners. Please try again.</p>
              </CardContent>
            </Card>
          ) : filteredOwners.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <Users className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No owners found</h3>
                <p className="text-slate-600 mb-4">
                  {searchTerm ? "No owners match your search criteria." : "Start by adding your first client."}
                </p>
                {!searchTerm && (
                  <Button onClick={() => setIsFormOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add First Owner
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOwners.map((owner: Owner) => (
                <Card key={owner.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-12 w-12">
                        <AvatarFallback className="bg-gradient-to-br from-secondary to-secondary/80 text-white">
                          {getInitials(owner.firstName, owner.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <CardTitle className="text-lg">
                          {owner.firstName} {owner.lastName}
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      {owner.email && (
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <Mail className="h-4 w-4" />
                          <span>{owner.email}</span>
                        </div>
                      )}
                      
                      {owner.phone && (
                        <div className="flex items-center space-x-2 text-sm text-slate-600">
                          <Phone className="h-4 w-4" />
                          <span>{owner.phone}</span>
                        </div>
                      )}
                      
                      {owner.address && (
                        <div className="flex items-start space-x-2 text-sm text-slate-600">
                          <MapPin className="h-4 w-4 mt-0.5" />
                          <div>
                            <p>{owner.address}</p>
                            {owner.city && owner.postalCode && (
                              <p>{owner.city}, {owner.postalCode}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {owner.notes && (
                        <div className="text-sm text-slate-600 bg-slate-50 p-2 rounded">
                          <p className="font-medium">Notas:</p>
                          <p>{owner.notes}</p>
                        </div>
                      )}

                      <div className="flex justify-end space-x-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedOwner(owner);
                            setIsFormOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteMutation.mutate(owner.id)}
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
