import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistRunner, VehicleListByCategory, type Vehicle } from "@/routes/index";

export const Route = createFileRoute("/admin/checklist")({ component: AdminChecklist });

function AdminChecklist() {
  const { user, isAdmin, loading } = useAuth();

  if (loading) return <div className="py-12 text-center text-muted-foreground text-sm">Carregando…</div>;
  if (!user || !isAdmin) return <Navigate to="/" />;

  return <ChecklistContent />;
}

function ChecklistContent() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("vehicles").select("*").eq("active", true).order("plate")
      .then(({ data }) => setVehicles(data ?? []));
  }, []);

  if (activeVehicleId) {
    return (
      <div className="-mx-4 md:-mx-6 -mb-4 md:-mb-6">
        <ChecklistRunner
          vehicleId={activeVehicleId}
          onClose={() => setActiveVehicleId(null)}
          embedded
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold">Selecione um veículo</h2>
        <p className="text-sm text-muted-foreground">Escolha o veículo para iniciar o checklist de inspeção.</p>
      </div>
      <VehicleListByCategory vehicles={vehicles} onSelect={setActiveVehicleId} />
    </div>
  );
}
