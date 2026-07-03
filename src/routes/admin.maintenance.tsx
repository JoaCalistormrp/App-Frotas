import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wrench, Plus, ClipboardList, Clock, CheckCircle2, AlertCircle, FilePlus, Trash2, Search, X as XIcon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { statusLabel, statusTone, type MaintenanceStatus } from "@/lib/maintenance";

export const Route = createFileRoute("/admin/maintenance")({ component: MaintenancePage });

type Order = {
  id: string; order_number: string; order_type: string; base_code: string; status: MaintenanceStatus;
  failure_description: string | null; workshop: string | null; created_at: string;
  vehicle_id: string | null; driver_id?: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  profiles?: { full_name: string | null } | null;
};

function MaintenancePage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { isAdmin, isMaster } = useAuth();
  const [tab, setTab] = useState<"orders" | "checklists">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("abertos");
  const [osSearch, setOsSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("maintenance_orders")
      .select("id, order_number, order_type, base_code, status, failure_description, workshop, created_at, vehicle_id, driver_id, vehicles(plate, model)")
      .is("deleted_at", null) // <-- CORREÇÃO 1: REGRA DA LIXEIRA ADICIONADA AQUI
      .order("created_at", { ascending: false });

    if (statusFilter === "abertos") {
      q = q.in("status", ["aberta", "pendente", "em_analise", "orcando_mao_obra", "orcando_pecas", "aguardando_aprovacao", "aprovada", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final"]);
    } else if (statusFilter === "concluidas") {
      q = q.in("status", ["finalizada", "solucionado"]);
    } else if (statusFilter !== "todos") {
      q = q.eq("status", statusFilter as never);
    }

    const { data, error } = await q;
    if (error) { toast.error("Erro: " + error.message); setLoading(false); return; }
    
    const rows = (data ?? []) as unknown as Order[];
    const driverIds = Array.from(new Set(rows.map((r) => r.driver_id).filter(Boolean) as string[]));
    
    let nameById: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    
    setOrders(rows.map((r) => ({ ...r, profiles: { full_name: r.driver_id ? nameById[r.driver_id] ?? "—" : null } })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter]);

  if (path.startsWith("/admin/maintenance/") && path !== "/admin/maintenance/") {
    return <Outlet />;
  }

  const filteredOrders = osSearch.trim()
    ? orders.filter((o) => {
        const q = osSearch.trim().toLowerCase();
        return (
          o.order_number.toLowerCase().includes(q) ||
          (o.vehicles?.plate ?? "").toLowerCase().includes(q) ||
          (o.vehicles?.model ?? "").toLowerCase().includes(q) ||
          (o.profiles?.full_name ?? "").toLowerCase().includes(q) ||
          (o.failure_description ?? "").toLowerCase().includes(q) ||
          (o.workshop ?? "").toLowerCase().includes(q)
        );
      })
    : orders;

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="size-6" />Gestão de Manutenção</h1>
          <p className="text-sm text-muted-foreground">Controle de OS (SMV/SMI) e Checklists com falhas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Link to="/admin/maintenance/trash">
              <Button variant="outline" size="sm"><Trash2 className="size-4 mr-1" />Lixeira</Button>
            </Link>
          )}
          <Link to="/admin/maintenance/$id" params={{ id: "new" }}>
            <Button size="sm"><Plus className="size-4 mr-1" />Nova OS</Button>
          </Link>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as "checklists" | "orders")}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="orders" className="flex-1 md:flex-none md:px-8"><Wrench className="size-4 mr-2" />Ordens de Serviço</TabsTrigger>
          <TabsTrigger value="checklists" className="flex-1 md:flex-none md:px-8"><ClipboardList className="size-4 mr-2" />Checklists</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3 pt-2">
          <Card className="p-3 space-y-2 bg-muted/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar por placa, nº OS, motorista, oficina…"
                value={osSearch}
                onChange={(e) => setOsSearch(e.target.value)}
                className="h-8 pl-7 text-sm pr-7"
              />
              {osSearch && (
                <button onClick={() => setOsSearch("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
                  <XIcon className="size-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant={statusFilter === "abertos" ? "default" : "outline"} onClick={() => setStatusFilter("abertos")}>
                <AlertCircle className="size-3 mr-1" />Em aberto
              </Button>
              {isMaster && (
                <Button size="sm" variant={statusFilter === "aguardando_aprovacao" ? "default" : "outline"} onClick={() => setStatusFilter("aguardando_aprovacao")} className={statusFilter !== "aguardando_aprovacao" ? "border-yellow-500/50 text-yellow-600 hover:bg-yellow-500/10" : "bg-yellow-500 text-white hover:bg-yellow-600"}>
                  <Clock className="size-3 mr-1" />Aguard. aprovação
                </Button>
              )}
              <Button size="sm" variant={statusFilter === "concluidas" ? "default" : "outline"} onClick={() => setStatusFilter("concluidas")}>
                <CheckCircle2 className="size-3 mr-1" />Concluídas
              </Button>
              <Button size="sm" variant={statusFilter === "todos" ? "default" : "outline"} onClick={() => setStatusFilter("todos")}>
                <ClipboardList className="size-3 mr-1" />Todos
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {loading && <Card className="p-6 text-sm text-muted-foreground text-center">Carregando…</Card>}
            {!loading && filteredOrders.length === 0 && (
              <Card className="p-6 text-sm text-muted-foreground text-center">
                {osSearch ? `Nenhuma OS encontrada para "${osSearch}".` : "Nenhuma ordem encontrada neste filtro."}
              </Card>
            )}
            {filteredOrders.map((o) => (
              <Link key={o.id} to="/admin/maintenance/$id" params={{ id: o.id }} className="block">
                <Card className="p-4 hover:bg-muted/40 transition cursor-pointer border-l-4" style={{ borderLeftColor: o.status === 'aguardando_aprovacao' ? '#eab308' : o.status === 'solucionado' || o.status === 'finalizada' ? '#22c55e' : '#3b82f6' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold flex items-center gap-2 flex-wrap">
                        <span className="text-primary">{o.order_number}</span>
                        <span className="text-[10px] uppercase bg-secondary px-2 py-0.5 rounded">{o.order_type}</span>
                        <StatusBadge status={o.status} />
                      </div>
                      <div className="text-sm mt-1">{o.vehicles?.plate ?? "—"} {o.vehicles?.model ? `• ${o.vehicles.model}` : ""}</div>
                      <div className="text-xs text-muted-foreground">Motorista: {o.profiles?.full_name ?? "—"}</div>
                      {o.failure_description && <div className="text-xs mt-1 text-muted-foreground line-clamp-1">{o.failure_description}</div>}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="checklists" className="pt-2">
          <AdminChecklistsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: MaintenanceStatus }) {
  return <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

// --- MICRO-MODAL PARA FOTOS (Complexidade Baixíssima) ---
type SelectedFailure = { item: string; obs: string; photo_url: string | null };

function FailurePhotoModal({ failure, onClose }: { failure: SelectedFailure; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!failure.photo_url);

  useEffect(() => {
    if (!failure.photo_url) return;
    let isMounted = true;
    supabase.storage.from("checklist-photos").createSignedUrl(failure.photo_url, 3600).then(({ data }) => {
      if (isMounted) { setUrl(data?.signedUrl ?? null); setLoading(false); }
    });
    return () => { isMounted = false; };
  }, [failure.photo_url]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="font-bold text-base text-destructive">Detalhe da Falha</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="font-bold text-sm">{failure.item}</div>
        {failure.obs && <div className="text-sm text-muted-foreground">{failure.obs}</div>}
        {loading && <div className="text-xs text-muted-foreground">Carregando foto...</div>}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="block mt-2">
            <img src={url} alt="Evidência" className="w-full h-auto max-h-64 object-cover rounded border border-border" />
          </a>
        )}
        {!failure.photo_url && <div className="text-xs text-muted-foreground italic mt-2">Sem foto anexada.</div>}
      </Card>
    </div>
  );
}

// --- Painel Interno de Checklists para o Admin ---
type ChecklistRow = {
  id: string; vehicle_id: string; driver_id: string; has_issues: boolean; status: string; created_at: string;
  vehicle?: { plate: string | null; model: string | null } | null;
  driver_name?: string | null;
  failures?: Array<{ id: string; item_name: string; observation: string | null; photo_url: string | null }>;
};

function AdminChecklistsPanel() {
  const [filter, setFilter] = useState<"falhas" | "ok" | "todos">("falhas");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFailure, setSelectedFailure] = useState<SelectedFailure | null>(null);
  const [osMap, setOsMap] = useState<Record<string, { order_number: string; id: string }>>({});
  const [clSearch, setClSearch] = useState("");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("checklists").select("id, vehicle_id, driver_id, has_issues, status, created_at").order("created_at", { ascending: false }).limit(80);
    if (filter === "falhas") q = q.eq("has_issues", true);
    if (filter === "ok") q = q.eq("has_issues", false);
    
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    
    const list = (data ?? []) as ChecklistRow[];
    const vehicleIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean)));
    const driverIds = Array.from(new Set(list.map((r) => r.driver_id).filter(Boolean)));
    const ids = list.map((r) => r.id);

    const [{ data: vs }, { data: ds }, { data: resps }, { data: osData }] = await Promise.all([
      vehicleIds.length ? supabase.from("vehicles").select("id, plate, model").in("id", vehicleIds) : Promise.resolve({ data: [] }),
      driverIds.length ? supabase.from("profiles").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("checklist_responses").select("id, checklist_id, item_id, observation, photo_url, status").in("checklist_id", ids).eq("status", "NAO_OK") : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("maintenance_orders").select("id, order_number, checklist_id").in("checklist_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] }),
    ]);

    const vById = Object.fromEntries((vs ?? []).map((v) => [v.id, v]));
    const dById = Object.fromEntries((ds ?? []).map((d) => [d.id, d.full_name ?? "—"]));

    const itemIds = Array.from(new Set((resps ?? []).map((r) => r.item_id)));
    let itemById: Record<string, string> = {};
    if (itemIds.length) {
      const { data: items } = await supabase.from("checklist_items").select("id, name").in("id", itemIds);
      itemById = Object.fromEntries((items ?? []).map((it) => [it.id, it.name]));
    }
    
    const failuresBy: Record<string, ChecklistRow["failures"]> = {};
    (resps ?? []).forEach((r) => {
      (failuresBy[r.checklist_id] ||= []).push({ id: r.id, item_name: itemById[r.item_id] ?? "Item", observation: r.observation, photo_url: r.photo_url });
    });

    setRows(list.map((r) => ({ ...r, vehicle: vById[r.vehicle_id] as any ?? null, driver_name: dById[r.driver_id] ?? "—", failures: failuresBy[r.id] ?? [] })));

    const newOsMap: Record<string, { order_number: string; id: string }> = {};
    for (const os of (osData ?? []) as Array<{ id: string; order_number: string; checklist_id: string }>) {
      if (os.checklist_id) newOsMap[os.checklist_id] = { id: os.id, order_number: os.order_number };
    }
    setOsMap(newOsMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const filteredRows = clSearch.trim()
    ? rows.filter((c) => {
        const q = clSearch.trim().toLowerCase();
        return (
          (c.vehicle?.plate ?? "").toLowerCase().includes(q) ||
          (c.vehicle?.model ?? "").toLowerCase().includes(q) ||
          (c.driver_name ?? "").toLowerCase().includes(q)
        );
      })
    : rows;

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2 bg-muted/30">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por placa, modelo ou motorista…"
            value={clSearch}
            onChange={(e) => setClSearch(e.target.value)}
            className="h-8 pl-7 text-sm pr-7"
          />
          {clSearch && (
            <button onClick={() => setClSearch("")} className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant={filter === "falhas" ? "default" : "outline"} onClick={() => setFilter("falhas")}>
            <AlertCircle className="size-3 mr-1" />Veículos com falhas
          </Button>
          <Button size="sm" variant={filter === "ok" ? "default" : "outline"} onClick={() => setFilter("ok")}>
            <CheckCircle2 className="size-3 mr-1" />OS ok
          </Button>
          <Button size="sm" variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")}>
            <ClipboardList className="size-3 mr-1" />Todos
          </Button>
        </div>
      </Card>

      {loading && <Card className="p-6 text-sm text-muted-foreground text-center">Carregando…</Card>}
      {!loading && filteredRows.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground text-center">
          {clSearch ? `Nenhum checklist encontrado para "${clSearch}".` : "Nenhum checklist encontrado."}
        </Card>
      )}

      <div className="space-y-2">
        {filteredRows.map((c) => (
          <Card key={c.id} className={`p-4 transition ${c.has_issues ? "border-l-4 border-l-destructive" : "border-l-4 border-l-emerald-500"}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-bold flex items-center gap-2 flex-wrap text-sm">
                  <span>{c.vehicle?.plate ?? "—"}</span>
                  {c.vehicle?.model && <span className="text-muted-foreground font-normal">• {c.vehicle.model}</span>}
                  {c.has_issues
                    ? <span className="text-[10px] uppercase bg-destructive/15 text-destructive px-2 py-0.5 rounded">Com falhas</span>
                    : <span className="text-[10px] uppercase bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded">OK</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Motorista: {c.driver_name} • {new Date(c.created_at).toLocaleString("pt-BR")}
                </div>
                
                {c.has_issues && c.failures && c.failures.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {c.failures.map((f) => (
                      <button 
                        key={f.id} 
                        onClick={() => setSelectedFailure({ item: f.item_name, obs: f.observation ?? "", photo_url: f.photo_url })} 
                        className="w-full text-left p-2 bg-destructive/5 hover:bg-destructive/10 transition rounded border border-destructive/10 flex items-center justify-between"
                      >
                        <span className="text-xs">
                          <span className="font-medium text-destructive/90">{f.item_name}</span>
                          {f.observation && <span className="text-muted-foreground"> — {f.observation}</span>}
                        </span>
                        {f.photo_url && <Search className="size-3 text-destructive/60 shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {c.has_issues && (
                osMap[c.id]
                  ? <Link to="/admin/maintenance/$id" params={{ id: osMap[c.id].id }}>
                      <Button size="sm" variant="outline" className="border-primary/50 text-primary hover:bg-primary/10 font-semibold">
                        <Wrench className="size-3 mr-1" />OS N°{osMap[c.id].order_number}
                      </Button>
                    </Link>
                  : <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never}>
                      <Button size="sm" variant="outline" className="border-primary/50 hover:bg-primary/10">
                        <FilePlus className="size-3 mr-1" />Abrir OS
                      </Button>
                    </Link>
              )}
            </div>
          </Card>
        ))}
      </div>

      {selectedFailure && <FailurePhotoModal failure={selectedFailure} onClose={() => setSelectedFailure(null)} />}
    </div>
  );
}