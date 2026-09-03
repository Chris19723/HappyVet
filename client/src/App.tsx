import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Patients from "@/pages/patients";
import PatientDetail from "@/pages/patient-detail";
import Owners from "@/pages/owners";
import Appointments from "@/pages/appointments";
import MedicalRecords from "@/pages/medical-records";
import Billing from "@/pages/billing";
import Inventory from "@/pages/inventory";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/patients" component={Patients} />
      <Route path="/patients/:id" component={PatientDetail} />
      <Route path="/owners" component={Owners} />
      <Route path="/appointments" component={Appointments} />
      <Route path="/medical-records" component={MedicalRecords} />
      <Route path="/billing" component={Billing} />
      <Route path="/inventory" component={Inventory} />
      <Route path="/">
        {isLoading || !isAuthenticated ? <Landing /> : <Dashboard />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
