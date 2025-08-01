import { Link, useLocation } from "wouter";
import { Heart, LayoutDashboard, Users, Calendar, FileText, Receipt, Package, BarChart3, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Sidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const navigationItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/patients", label: "Pacientes", icon: Heart },
    { href: "/owners", label: "Propietarios", icon: Users },
    { href: "/appointments", label: "Citas", icon: Calendar },
    { href: "/medical-records", label: "Historiales Médicos", icon: FileText },
    { href: "/billing", label: "Facturación", icon: Receipt },
    { href: "/inventory", label: "Inventario", icon: Package },
  ];

  const isActive = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  return (
    <aside className="w-64 bg-white shadow-lg flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Heart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Happy Animals</h1>
            <p className="text-sm text-slate-600">Gestión Veterinaria</p>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-2">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <a
                className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className={isActive(item.href) ? "font-medium" : ""}>{item.label}</span>
              </a>
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-secondary rounded-full flex items-center justify-center">
            <span className="text-white font-medium">
              {user ? `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}` : 'U'}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-900">
              {user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Usuario' : 'Usuario'}
            </p>
            <p className="text-xs text-slate-600">Veterinario</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.location.href = '/api/logout'}
            className="text-slate-400 hover:text-slate-600"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
