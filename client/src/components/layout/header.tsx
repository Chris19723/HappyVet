import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  subtitle: string;
  showSearch?: boolean;
  onSearch?: (term: string) => void;
  actions?: React.ReactNode;
}

export default function Header({ 
  title, 
  subtitle, 
  showSearch = true, 
  onSearch,
  actions 
}: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-slate-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <p className="text-slate-600 mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center space-x-4">
          {showSearch && (
            <div className="relative">
              <Input
                type="text"
                placeholder="Buscar..."
                className="w-80 pl-10 pr-4 py-2"
                onChange={(e) => onSearch?.(e.target.value)}
              />
              <Search className="w-5 h-5 text-slate-400 absolute left-3 top-2.5" />
            </div>
          )}
          {actions}
        </div>
      </div>
    </header>
  );
}
