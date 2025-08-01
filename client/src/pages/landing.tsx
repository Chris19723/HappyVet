import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart, Calendar, FileText, Users, BarChart3, Package } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      <div className="container mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <div className="w-16 h-16 bg-primary rounded-xl flex items-center justify-center">
              <Heart className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Happy Animals</h1>
              <p className="text-xl text-slate-600">Sistema de Gestión Veterinaria</p>
            </div>
          </div>
          <p className="text-lg text-slate-700 max-w-2xl mx-auto">
            Gestiona tu clínica veterinaria de manera eficiente con nuestro sistema integral 
            de administración de pacientes, citas, historiales médicos y facturación.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-primary/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-xl">Gestión de Pacientes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Registra y administra información completa de mascotas y sus propietarios
              </p>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-secondary/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-secondary" />
              </div>
              <CardTitle className="text-xl">Sistema de Citas</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Programa y organiza citas de manera eficiente con recordatorios automáticos
              </p>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-accent/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <FileText className="w-6 h-6 text-accent-foreground" />
              </div>
              <CardTitle className="text-xl">Historiales Médicos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Mantén registros detallados de tratamientos, diagnósticos y seguimientos
              </p>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-warning/10 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-warning" />
              </div>
              <CardTitle className="text-xl">Facturación</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Genera facturas automáticamente y lleva control de pagos
              </p>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-purple-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <Package className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Inventario</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Controla el stock de medicamentos y suministros con alertas automáticas
              </p>
            </CardContent>
          </Card>

          <Card className="text-center hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="w-12 h-12 bg-green-100 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-xl">Reportes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">
                Obtén insights con reportes detallados de tu práctica veterinaria
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl mb-4">¡Comienza ahora!</CardTitle>
              <p className="text-slate-600 mb-6">
                Accede al sistema de gestión veterinaria Happy Animals
              </p>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => window.location.href = '/api/login'}
                className="w-full text-lg py-3"
                size="lg"
              >
                Iniciar Sesión
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
