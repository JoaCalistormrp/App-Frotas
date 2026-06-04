import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Wrench, LogOut, CheckCircle2, Clock, AlertCircle, X as XIcon, Camera, Trash2, ClipboardList, FilePlus } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";
import { STATUS_OPTIONS, statusLabel, statusTone, NEEDS_LABOR_BUDGET, NEEDS_PARTS_BUDGET, IS_DONE_STATUS, type MaintenanceStatus } from "@/lib/maintenance";

export const Route = createFileRoute("/mechanic")({ component: MechanicPage });

type Order = {
  id: string; order_number: string; order_type: "SMI" | "SMV"; base_code: string;
  status: MaintenanceStatus;
  failure_description: string | null; service_type: string | null; workshop: string | null;
  solution_description: string | null; items_replaced: string | null;
  km_atual: number | null; validade_oleo: string | null; mod_carro: string | null;
  data_entrada: string | null; hora_entrada: string | null;
  data_saida: string | null; hora_saida: string | null;
  maintenance_category: string | null;
  labor_description?: string | null; labor_hours?: number | null; labor_cost?: number | null;
  parts_needed?: string | null; parts_supplier?: string | null; parts_cost?: number | null;
  final_observation?: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  profiles?: { full_name: string | null } | null;
};

function MechanicPage() {
  const { user, loading, isMechanic, isAdmin, signOut } = useAuth();
  const [tab, setTab] = useState<"checklists" | "orders">("checklists");
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("abertos");
  const [editing, setEditing] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFromChecklist, setCreatingFromChecklist] = useState<ChecklistRow | null>(null);

  const load = async () => {
    let q = supabase
      .from("maintenance_orders")
      .select("*, vehicles(plate, model)")
      .order("created_at", { ascending: false });
    if (statusFilter === "abertos") {
      q = q.in("status", ["aberta", "pendente", "em_analise", "orcando_mao_obra", "orcando_pecas", "aguardando_aprovacao", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final"]);
    } else if (statusFilter === "concluidas") {
      q = q.in("status", ["finalizada", "solucionado"]);
    } else if (statusFilter !== "todos") {
      q = q.eq("status", statusFilter as never);
    }
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as Order[];
    const driverIds = Array.from(new Set(rows.map((r) => (r as { driver_id?: string | null }).driver_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase.from("drivers_directory").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setOrders(rows.map((r) => ({ ...r, profiles: { full_name: nameById[(r as { driver_id?: string | null }).driver_id ?? ""] ?? null } })));
  };
  useEffect(() => { if (user && (isMechanic || isAdmin)) load(); /* eslint-disable-next-line */ }, [user, isMechanic, isAdmin, statusFilter]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/" />;
  if (!isMechanic && !isAdmin) return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoTomaz} alt="Grupo Tomaz" className="h-9 w-auto object-contain" />
            <div>
              <div className="font-bold text-sm flex items-center gap-2"><Wrench className="size-4" />Painel do Mecânico</div>
              <div className="text-[11px] text-muted-foreground">{user.email}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={signOut}><LogOut className="size-4" />Sair</Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 space-y-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "checklists" | "orders")}>
          <TabsList className="w-full">
            <TabsTrigger value="checklists" className="flex-1"><ClipboardList className="size-4" />Checklists</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1"><Wrench className="size-4" />Ordens de Serviço</TabsTrigger>
          </TabsList>

          <TabsContent value="checklists" className="space-y-3">
            <ChecklistsPanel onOpenOSFromChecklist={(c) => setCreatingFromChecklist(c)} />
          </TabsContent>

          <TabsContent value="orders" className="space-y-3">
            <Card className="p-3 flex gap-2 flex-wrap">
          {([
            ["abertos", "Em aberto", AlertCircle],
            ["aguardando_aprovacao", "Aguard. aprovação", Clock],
            ["aguardando_pecas", "Aguard. peças", Clock],
            ["em_execucao", "Em execução", Wrench],
            ["concluidas", "Concluídas", CheckCircle2],
            ["todos", "Todos", Clock],
          ] as const).map(([v, l, Icon]) => (
            <Button key={v} size="sm" variant={statusFilter === v ? "default" : "outline"} onClick={() => setStatusFilter(v)}>
              <Icon className="size-3" />{l}
            </Button>
          ))}
          <div className="ml-auto">
            <Button size="sm" onClick={() => setCreating(true)}>+ Nova OS</Button>
          </div>
        </Card>

        <div className="space-y-2">
          {orders.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">Nenhuma ordem.</Card>}
          {orders.map((o) => (
            <Card key={o.id} className="p-4 hover:bg-muted/20 cursor-pointer" onClick={() => setEditing(o)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold flex items-center gap-2 flex-wrap">
                    <span className="text-primary">{o.order_number}</span>
                    <span className="text-[10px] uppercase bg-secondary px-2 py-0.5 rounded">{o.order_type}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="text-sm mt-1">{o.vehicles?.plate ?? "—"} {o.vehicles?.model ? `• ${o.vehicles.model}` : ""}</div>
                  <div className="text-xs text-muted-foreground">Motorista: {o.profiles?.full_name ?? "—"}</div>
                  {o.failure_description && <div className="text-xs mt-1 line-clamp-2">{o.failure_description}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
          </TabsContent>
        </Tabs>
      </main>

      {editing && <OrderModal order={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {creating && <NewOrderModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {creatingFromChecklist && (
        <NewOrderModal
          presetChecklist={creatingFromChecklist}
          onClose={() => setCreatingFromChecklist(null)}
          onCreated={() => { setCreatingFromChecklist(null); setTab("orders"); load(); }}
        />
      )}
      <footer className="border-t border-border bg-card px-4 py-2 text-center text-[11px] text-muted-foreground">
        Desenvolvido por Julia Ramos
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  return <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

// ---------------- Checklists panel ----------------

type ChecklistRow = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  has_issues: boolean;
  status: string;
  completed_at: string | null;
  created_at: string;
  observations: string | null;
  vehicle?: { plate: string | null; model: string | null; base: string | null } | null;
  driver_name?: string | null;
  failures?: Array<{ id: string; item_name: string; observation: string | null; photo_url: string | null }>;
};

function ChecklistsPanel({ onOpenOSFromChecklist }: { onOpenOSFromChecklist: (c: ChecklistRow) => void }) {
  const [filter, setFilter] = useState<"falhas" | "ok" | "todos">("falhas");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("checklists")
      .select("id, vehicle_id, driver_id, has_issues, status, completed_at, created_at, observations")
      .order("created_at", { ascending: false })
      .limit(80);
    if (filter === "falhas") q = q.eq("has_issues", true);
    if (filter === "ok") q = q.eq("has_issues", false);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as ChecklistRow[];

    const vehicleIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean)));
    const driverIds = Array.from(new Set(list.map((r) => r.driver_id).filter(Boolean)));
    const ids = list.map((r) => r.id);

    const [{ data: vs }, { data: ds }, { data: resps }] = await Promise.all([
      vehicleIds.length
        ? supabase.from("vehicles").select("id, plate, model, base").in("id", vehicleIds)
        : Promise.resolve({ data: [] as Array<{ id: string; plate: string | null; model: string | null; base: string | null }> }),
      driverIds.length
        ? supabase.from("drivers_directory").select("id, full_name").in("id", driverIds)
        : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
      ids.length
        ? supabase
            .from("checklist_responses")
            .select("id, checklist_id, item_id, observation, photo_url, status")
            .in("checklist_id", ids)
            .eq("status", "with_issue" as never)
        : Promise.resolve({ data: [] as Array<{ id: string; checklist_id: string; item_id: string; observation: string | null; photo_url: string | null; status: string }> }),
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
      (failuresBy[r.checklist_id] ||= []).push({
        id: r.id,
        item_name: itemById[r.item_id] ?? "Item",
        observation: r.observation,
        photo_url: r.photo_url,
      });
    });

    setRows(list.map((r) => ({
      ...r,
      vehicle: vById[r.vehicle_id] ?? null,
      driver_name: dById[r.driver_id] ?? "—",
      failures: failuresBy[r.id] ?? [],
    })));
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex gap-2 flex-wrap">
        <Button size="sm" variant={filter === "falhas" ? "default" : "outline"} onClick={() => setFilter("falhas")}>
          <AlertCircle className="size-3" />Veículos com falhas
        </Button>
        <Button size="sm" variant={filter === "ok" ? "default" : "outline"} onClick={() => setFilter("ok")}>
          <CheckCircle2 className="size-3" />OS ok
        </Button>
        <Button size="sm" variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")}>
          <Clock className="size-3" />Todos
        </Button>
      </Card>

      {loading && <Card className="p-6 text-sm text-muted-foreground text-center">Carregando…</Card>}
      {!loading && rows.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground text-center">Nenhum checklist nesta categoria.</Card>
      )}
      <div className="space-y-2">
        {rows.map((c) => (
          <Card key={c.id} className={`p-4 ${c.has_issues ? "border-l-4 border-l-destructive" : "border-l-4 border-l-emerald-500"}`}>
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
                  <ul className="mt-2 text-xs space-y-1">
                    {c.failures.map((f) => (
                      <li key={f.id} className="p-1.5 bg-destructive/5 rounded">
                        <span className="font-medium">{f.item_name}</span>
                        {f.observation && <span className="text-muted-foreground"> — {f.observation}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {c.has_issues && (
                <Button size="sm" onClick={() => onOpenOSFromChecklist(c)}>
                  <FilePlus className="size-3" />Abrir OS
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function OrderModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = useState(order.status);
  const [solution, setSolution] = useState(order.solution_description ?? "");
  const [items, setItems] = useState(order.items_replaced ?? "");
  const [km, setKm] = useState(order.km_atual?.toString() ?? "");
  const [oleo, setOleo] = useState(order.validade_oleo ?? "");
  const [dataSaida, setDataSaida] = useState(order.data_saida ?? "");
  const [horaSaida, setHoraSaida] = useState(order.hora_saida ?? "");
  const [laborDesc, setLaborDesc] = useState(order.labor_description ?? "");
  const [laborHours, setLaborHours] = useState(order.labor_hours?.toString() ?? "");
  const [laborCost, setLaborCost] = useState(order.labor_cost?.toString() ?? "");
  const [partsNeeded, setPartsNeeded] = useState(order.parts_needed ?? "");
  const [partsSupplier, setPartsSupplier] = useState(order.parts_supplier ?? "");
  const [partsCost, setPartsCost] = useState<string>(order.parts_cost?.toString() ?? "");
  const [finalObs, setFinalObs] = useState(order.final_observation ?? "");
  const [evoNote, setEvoNote] = useState("");
  const [evolutions, setEvolutions] = useState<Array<{ id: string; created_at: string; status: string | null; observation: string; user_id: string | null; user_name?: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    const { data } = await supabase
      .from("maintenance_evolutions")
      .select("id, created_at, status, observation, user_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{ id: string; created_at: string; status: string | null; observation: string; user_id: string | null }>;
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: dd } = await supabase.from("drivers_directory").select("id, full_name").in("id", ids);
      nameById = Object.fromEntries((dd ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setEvolutions(rows.map((r) => ({ ...r, user_name: r.user_id ? nameById[r.user_id] ?? null : null })));
  })(); }, [order.id]);

  const save = async () => {
    if (IS_DONE_STATUS(status) && !finalObs.trim()) {
      toast.error("Adicione uma observação final antes de concluir a OS");
      return;
    }
    if (NEEDS_LABOR_BUDGET(status) && !laborDesc.trim()) {
      toast.error("Descreva a mão de obra orçada");
      return;
    }
    if (NEEDS_PARTS_BUDGET(status) && !partsNeeded.trim()) {
      toast.error("Liste as peças necessárias");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        status, solution_description: solution || null, items_replaced: items || null,
        km_atual: km ? Number(km) : null, validade_oleo: oleo || null,
        data_saida: dataSaida || null, hora_saida: horaSaida || null,
        labor_description: laborDesc || null,
        labor_hours: laborHours ? Number(laborHours) : null,
        labor_cost: laborCost ? Number(laborCost) : null,
        parts_needed: partsNeeded || null,
        parts_supplier: partsSupplier || null,
        parts_cost: partsCost ? Number(partsCost) : null,
        final_observation: finalObs || null,
        ...(IS_DONE_STATUS(status) ? { signed_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase.from("maintenance_orders").update(payload).eq("id", order.id);
      if (error) throw error;
      // grava evolução automaticamente (status + nota opcional)
      const obs = evoNote.trim() || `Status atualizado para "${statusLabel(status)}"`;
      await supabase.from("maintenance_evolutions").insert({
        order_id: order.id, user_id: user?.id ?? null, status, observation: obs,
      });
      toast.success("Atualizada");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2"><Wrench className="size-5" />{order.order_number} — {order.order_type}</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Veículo: {order.vehicles?.plate ?? "—"} {order.vehicles?.model ? `• ${order.vehicles.model}` : ""}<br />
          Motorista: {order.profiles?.full_name ?? "—"}
        </div>
        {order.failure_description && (
          <div><Label className="text-xs">Falha relatada</Label><div className="text-sm p-2 bg-muted rounded">{order.failure_description}</div></div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div><Label className="text-xs">Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value as MaintenanceStatus)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">KM atual</Label><Input value={km} onChange={(e) => setKm(e.target.value)} type="number" /></div>
          <div><Label className="text-xs">Validade do óleo</Label><Input value={oleo} onChange={(e) => setOleo(e.target.value)} placeholder="KM ou data" /></div>
          <div><Label className="text-xs">Data saída</Label><Input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} /></div>
          <div><Label className="text-xs">Hora saída</Label><Input type="time" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} /></div>
        </div>

        {NEEDS_LABOR_BUDGET(status) && (
          <Card className="p-3 space-y-2 bg-indigo-500/5 border-indigo-500/20">
            <div className="font-semibold text-xs">Orçamento de mão de obra *</div>
            <div><Label className="text-xs">Descrição da mão de obra</Label><Textarea rows={2} value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Horas previstas</Label><Input type="number" step="0.5" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} /></div>
              <div><Label className="text-xs">Valor estimado (R$)</Label><Input type="number" step="0.01" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} /></div>
            </div>
          </Card>
        )}

        {NEEDS_PARTS_BUDGET(status) && (
          <Card className="p-3 space-y-2 bg-indigo-500/5 border-indigo-500/20">
            <div className="font-semibold text-xs">Orçamento de peças *</div>
            <div><Label className="text-xs">Peças necessárias / quantidade</Label><Textarea rows={2} value={partsNeeded} onChange={(e) => setPartsNeeded(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-xs">Fornecedor</Label><Input value={partsSupplier} onChange={(e) => setPartsSupplier(e.target.value)} /></div>
              <div><Label className="text-xs">Valor estimado (R$)</Label><Input type="number" step="0.01" value={partsCost} onChange={(e) => setPartsCost(e.target.value)} /></div>
            </div>
          </Card>
        )}

        <div><Label className="text-xs">Descrição da solução</Label><Textarea rows={4} value={solution} onChange={(e) => setSolution(e.target.value)} /></div>
        <div><Label className="text-xs">Itens trocados</Label><Textarea rows={3} value={items} onChange={(e) => setItems(e.target.value)} /></div>

        {IS_DONE_STATUS(status) && (
          <div>
            <Label className="text-xs">Observação final do mecânico *</Label>
            <Textarea rows={2} value={finalObs} onChange={(e) => setFinalObs(e.target.value)} placeholder="Obrigatória para concluir a OS" />
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <div className="font-semibold text-sm">Evolução da manutenção</div>
          <Textarea rows={2} value={evoNote} onChange={(e) => setEvoNote(e.target.value)} placeholder="Observação desta atualização (opcional)" />
          <div className="space-y-1 max-h-48 overflow-auto">
            {evolutions.length === 0 && <div className="text-xs text-muted-foreground">Sem registros ainda.</div>}
            {evolutions.map((e) => (
              <div key={e.id} className="text-xs p-2 bg-muted/50 rounded">
                <div className="flex justify-between gap-2 text-muted-foreground">
                  <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                  <span className={`px-1.5 rounded ${statusTone(e.status ?? "")}`}>{statusLabel(e.status ?? "—")}</span>
                </div>
                <div className="font-medium">{e.user_name ?? "—"}</div>
                <div>{e.observation}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? "..." : IS_DONE_STATUS(status) ? "Concluir OS" : "Salvar"}</Button>
        </div>
      </Card>
    </div>
  );
}

type VehicleOpt = { id: string; plate: string | null; model: string | null; base: string | null };

function NewOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [vehicleId, setVehicleId] = useState("");
  const [orderType, setOrderType] = useState<"SMI" | "SMV">("SMI");
  const [base, setBase] = useState("");
  const [failure, setFailure] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [workshop, setWorkshop] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("vehicles").select("id, plate, model, base").eq("active", true).order("plate").then(({ data }) => {
      setVehicles((data ?? []) as VehicleOpt[]);
    });
  }, []);

  const create = async () => {
    if (!vehicleId) { toast.error("Selecione um veículo"); return; }
    const v = vehicles.find((x) => x.id === vehicleId);
    const baseCode = (base || v?.base || "GERAL").trim().toUpperCase();
    if (!failure.trim()) { toast.error("Descreva a falha"); return; }
    setBusy(true);
    try {
      const { data: numData, error: numErr } = await supabase.rpc("next_order_number", { _base: baseCode });
      if (numErr) throw numErr;
      const orderNumber = numData as unknown as string;
      const { error } = await supabase.from("maintenance_orders").insert({
        order_number: orderNumber,
        order_type: orderType,
        base_code: baseCode,
        vehicle_id: vehicleId,
        failure_description: failure,
        service_type: serviceType || null,
        workshop: workshop || null,
        status: "pendente",
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      toast.success(`OS ${orderNumber} aberta`);
      onCreated();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-xl p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg flex items-center gap-2"><Wrench className="size-5" />Nova Ordem de Serviço</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Tipo</Label>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as "SMI" | "SMV")} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="SMI">SMI — Interna</option>
              <option value="SMV">SMV — Veicular</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Base</Label>
            <Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="Ex: SLZ" />
          </div>
        </div>
        <div>
          <Label className="text-xs">Veículo</Label>
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">Selecione…</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>{v.plate} {v.model ? `— ${v.model}` : ""} {v.base ? `(${v.base})` : ""}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Descrição da falha</Label>
          <Textarea rows={4} value={failure} onChange={(e) => setFailure(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">Tipo de serviço</Label><Input value={serviceType} onChange={(e) => setServiceType(e.target.value)} /></div>
          <div><Label className="text-xs">Oficina</Label><Input value={workshop} onChange={(e) => setWorkshop(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={create} disabled={busy}>{busy ? "..." : "Abrir OS"}</Button>
        </div>
      </Card>
    </div>
  );
}