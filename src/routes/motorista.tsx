import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ERPSidebar } from "@/components/erp-sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { ChecklistRunner, VehicleListByCategory, type Vehicle } from "@/routes/index";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Truck, Loader2, ClipboardList, Construction, Building2, Anchor, Wrench } from "lucide-react";

export const Route = createFileRoute("/motorista")({ component: MotoristaPage });

function MotoristaPage() {
  const { user, isDriver, isMechanic, loading, modules } = useAuth();

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Carregando…</div>;
  if (!user) return <Navigate to="/" />;
  if (!isDriver && !isMechanic) return <Navigate to="/home" />;

  const hasFrotasAccess = modules.some((s) => s === "frotas" || s.startsWith("frotas."));

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ERPSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-2 gap-2">
            <SidebarTrigger />
            <ClipboardList className="size-4 text-primary" />
            <span className="text-sm font-semibold">Checklist Diário</span>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            {hasFrotasAccess ? (
              <MotoristaChecklist />
            ) : (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <ClipboardList className="size-12 text-muted-foreground opacity-30" />
                <div>
                  <p className="font-semibold text-base">Sem acesso configurado</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Contacte o administrador para ativar o módulo de Frotas no seu perfil.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

const TYPE_LABELS: Record<string, string> = {
  PESADOS:        "Pesados",
  OPERACIONAIS:   "Operacional",
  CESTO_AEREO:    "Cesto Aéreo",
  ADMINISTRATIVO: "Administrativo",
  MUNCK:          "Munck",
  MAQUINARIO:     "Maquinário",
  ELETRICISTA:    "Eletricista",
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  PESADOS:        Truck,
  OPERACIONAIS:   Wrench,
  CESTO_AEREO:    Construction,
  ADMINISTRATIVO: Building2,
  MUNCK:          Anchor,
  MAQUINARIO:     Wrench,
  ELETRICISTA:    Wrench,
};

const CHECKLIST_TYPE_SLUGS: Record<string, string> = {
  "frotas.checklists.pesados":        "PESADOS",
  "frotas.checklists.cesto_aereo":    "CESTO_AEREO",
  "frotas.checklists.operacionais":   "OPERACIONAIS",
  "frotas.checklists.maquinario":     "MAQUINARIO",
  "frotas.checklists.munck":          "MUNCK",
  "frotas.checklists.administrativo": "ADMINISTRATIVO",
};

function getAllowedTypes(modules: string[]): string[] | null {
  const allowed = Object.entries(CHECKLIST_TYPE_SLUGS)
    .filter(([slug]) => modules.includes(slug))
    .map(([, type]) => type);
  return allowed.length > 0 ? allowed : null; // null = sem restrição
}

function MotoristaChecklist() {
  const { signOut, modules } = useAuth();
  const [templates, setTemplates] = useState<{ id: string; vehicle_type: string }[]>([]);
  const [vehicles, setVehicles]   = useState<Vehicle[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedType, setSelectedType]       = useState<string | null>(null);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      supabase.from("checklist_templates" as any).select("id, vehicle_type"),
      supabase.from("vehicles").select("*").eq("active", true).order("plate"),
    ]).then(([tplRes, vRes]) => {
      setTemplates((tplRes.data ?? []) as any[]);
      setVehicles((vRes.data ?? []) as Vehicle[]);
      setLoadingData(false);
    });
  }, []);

  const allowedTypes = getAllowedTypes(modules);
  const visibleTemplates = allowedTypes
    ? templates.filter((t) => allowedTypes.includes(t.vehicle_type))
    : templates;

  // ── Etapa 3: Checklist ─────────────────────────────────────────────────────
  if (activeVehicleId) {
    return (
      <div className="-mx-4 sm:-mx-6 -mb-4 sm:-mb-6">
        <ChecklistRunner
          vehicleId={activeVehicleId}
          checklistType={selectedType ?? undefined}
          onClose={() => setActiveVehicleId(null)}
          onSubmitted={signOut}
          embedded
        />
      </div>
    );
  }

  // ── Etapa 2: Selecionar veículo ────────────────────────────────────────────
  if (selectedType) {
    const filtered = vehicles.filter(
      (v) => v.vehicle_type === selectedType || (v.checklist_types ?? []).includes(selectedType)
    );
    const label = TYPE_LABELS[selectedType] ?? selectedType;

    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setSelectedType(null)}>
            <ArrowLeft className="size-4" /> Voltar
          </Button>
          <div>
            <h2 className="text-lg font-bold">Selecione o veículo</h2>
            <p className="text-sm text-muted-foreground">Checklist: <span className="font-medium text-foreground">{label}</span></p>
          </div>
        </div>
        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            <Truck className="size-8 mx-auto mb-2 opacity-40" />
            Nenhum veículo ativo para este tipo.
          </Card>
        ) : (
          <VehicleListByCategory vehicles={filtered} onSelect={setActiveVehicleId} />
        )}
      </div>
    );
  }

  // ── Etapa 1: Selecionar tipo de checklist ──────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h2 className="text-lg font-bold">Tipo de Checklist</h2>
        <p className="text-sm text-muted-foreground">Selecione o tipo de inspeção que deseja realizar.</p>
      </div>

      {loadingData ? (
        <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </div>
      ) : visibleTemplates.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground text-sm">
          <ClipboardList className="size-8 mx-auto mb-2 opacity-40" />
          Nenhum checklist disponível para o seu perfil.
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visibleTemplates.map((tpl) => {
            const label = TYPE_LABELS[tpl.vehicle_type] ?? tpl.vehicle_type;
            const Icon  = TYPE_ICONS[tpl.vehicle_type] ?? ClipboardList;
            const count = vehicles.filter(
              (v) => v.vehicle_type === tpl.vehicle_type || (v.checklist_types ?? []).includes(tpl.vehicle_type)
            ).length;
            return (
              <Card
                key={tpl.id}
                className="p-5 cursor-pointer hover:border-primary hover:bg-accent/30 transition-all flex flex-col items-center gap-3 text-center group"
                onClick={() => setSelectedType(tpl.vehicle_type)}
              >
                <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                  <Icon className="size-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-sm">{label}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{count} veículo{count !== 1 ? "s" : ""}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
