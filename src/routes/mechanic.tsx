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
import { Wrench, LogOut, CheckCircle2, Clock, AlertCircle, X as XIcon, Camera, Trash2, ClipboardList, FilePlus, Search, Paperclip } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";
import { FINAL_STATUSES, STATUS_OPTIONS, statusLabel, statusTone, NEEDS_LABOR_BUDGET, NEEDS_PARTS_BUDGET, IS_DONE_STATUS, type MaintenanceStatus } from "@/lib/maintenance";

// --- VALIDADOR ISOLADO (Evita complexidade > 10 na função save) ---
function validateSavePayload(status: string, finalObs: string, photos: any[], laborDesc: string, partsNeeded: string) {
  if (IS_DONE_STATUS(status as any)) {
    if (!finalObs.trim()) return "Adicione uma observação final antes de concluir a OS";
    if (!photos.some((p) => p.category === "conclusao")) return "Anexe pelo menos 1 foto de Conclusão antes de finalizar";
  }
  if (NEEDS_LABOR_BUDGET(status as any) && !laborDesc.trim()) return "Descreva a mão de obra orçada";
  if (NEEDS_PARTS_BUDGET(status as any) && !partsNeeded.trim()) return "Liste as peças necessárias";
  return null;
}

// --- MICRO-MODAL PARA ANEXAR ORÇAMENTO ---
function BudgetUploadModal({ onClose, onConfirm, busy }: { onClose: () => void, onConfirm: (f: File) => void, busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-primary flex items-center gap-2"><Paperclip className="size-5" />Anexar Orçamento</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground">O status mudou para "Aguardando Aprovação". Por favor, anexe a foto ou PDF do orçamento para o Master avaliar.</p>
        <input 
          type="file" 
          accept="image/*,.pdf" 
          ref={ref} 
          className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" 
        />
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Pular</Button>
          <Button className="flex-1" disabled={busy} onClick={() => {
            const f = ref.current?.files?.[0];
            if (!f) return toast.error("Selecione um arquivo primeiro.");
            onConfirm(f);
          }}>{busy ? "Enviando..." : "Enviar Orçamento"}</Button>
        </div>
      </Card>
    </div>
  );
}

// --- MICRO-MODAL PARA FOTOS DE FALHAS ---
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
  const { user, loading, isMechanic, isMaster, signOut } = useAuth();
  const [tab, setTab] = useState<"checklists" | "orders">("checklists");
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("abertos");
  const [editing, setEditing] = useState<Order | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingFromChecklist, setCreatingFromChecklist] = useState<ChecklistRow | null>(null);
  
  // Controle para forçar a tela de Checklists a recarregar após criarmos a OS
  const [refreshTick, setRefreshTick] = useState(0);

  const load = async () => {
    let q = supabase
      .from("maintenance_orders")
      .select("*, vehicles(plate, model)")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (statusFilter === "abertos") {
      q = q.in("status", ["aberta", "pendente", "em_analise", "orcando_mao_obra", "orcando_pecas", "aguardando_aprovacao", "aprovada", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final"]);
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
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setOrders(rows.map((r) => ({ ...r, profiles: { full_name: nameById[(r as { driver_id?: string | null }).driver_id ?? ""] ?? null } })));
  };
  useEffect(() => { if (user && isMechanic) load(); /* eslint-disable-next-line */ }, [user, isMechanic, statusFilter]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/" />;
  if (!isMechanic) return <Navigate to="/" />;

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
            <TabsTrigger value="checklists" className="flex-1"><ClipboardList className="size-4 mr-2" />Checklists</TabsTrigger>
            <TabsTrigger value="orders" className="flex-1"><Wrench className="size-4 mr-2" />Ordens de Serviço</TabsTrigger>
          </TabsList>

          <TabsContent value="checklists" className="space-y-3">
            <ChecklistsPanel onOpenOSFromChecklist={(c) => setCreatingFromChecklist(c)} refreshTick={refreshTick} />
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
              <Icon className="size-3 mr-1" />{l}
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
          onCreated={() => { 
            setCreatingFromChecklist(null); 
            setRefreshTick(r => r + 1); // Força a aba de checklists a recalcular e ver a OS nova
            setTab("orders"); 
            load(); 
          }}
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
  id: string; vehicle_id: string; driver_id: string; has_issues: boolean; status: string;
  completed_at: string | null; created_at: string; observations: string | null;
  vehicle?: { plate: string | null; model: string | null; base: string | null } | null;
  driver_name?: string | null;
  failures?: Array<{ id: string; item_name: string; observation: string | null; photo_url: string | null }>;
  linked_os?: { id: string; number: string } | null; // Novo campo
};

function ChecklistsPanel({ onOpenOSFromChecklist, refreshTick }: { onOpenOSFromChecklist: (c: ChecklistRow) => void, refreshTick: number }) {
  const [filter, setFilter] = useState<"falhas" | "ok" | "todos">("falhas");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFailure, setSelectedFailure] = useState<SelectedFailure | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("checklists").select("id, vehicle_id, driver_id, has_issues, status, completed_at, created_at, observations").order("created_at", { ascending: false }).limit(80);
    if (filter === "falhas") q = q.eq("has_issues", true);
    if (filter === "ok") q = q.eq("has_issues", false);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as ChecklistRow[];

    const vehicleIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean)));
    const driverIds = Array.from(new Set(list.map((r) => r.driver_id).filter(Boolean)));
    const ids = list.map((r) => r.id);

    // MÁGICA AQUI: Puxamos as ordens de serviço ativas para ver se o checklist já tem OS gerada
    const [{ data: vs }, { data: ds }, { data: resps }, { data: osData }] = await Promise.all([
      vehicleIds.length ? supabase.from("vehicles").select("id, plate, model, base").in("id", vehicleIds) : Promise.resolve({ data: [] as any[] }),
      driverIds.length ? supabase.from("profiles").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from("checklist_responses").select("id, checklist_id, item_id, observation, photo_url, status").in("checklist_id", ids).eq("status", "NAO_OK") : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from("maintenance_orders").select("id, order_number, checklist_id").in("checklist_id", ids).is("deleted_at", null) : Promise.resolve({ data: [] as any[] })
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

    const osByChecklist: Record<string, { id: string, number: string }> = {};
    (osData ?? []).forEach(os => {
      if (os.checklist_id) osByChecklist[os.checklist_id] = { id: os.id, number: os.order_number };
    });

    setRows(list.map((r) => ({ 
      ...r, 
      vehicle: vById[r.vehicle_id] ?? null, 
      driver_name: dById[r.driver_id] ?? "—", 
      failures: failuresBy[r.id] ?? [],
      linked_os: osByChecklist[r.id] ?? null
    })));
    setLoading(false);
  };
  
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, refreshTick]);

  return (
    <div className="space-y-3">
      <Card className="p-3 flex gap-2 flex-wrap">
        <Button size="sm" variant={filter === "falhas" ? "default" : "outline"} onClick={() => setFilter("falhas")}>
          <AlertCircle className="size-3 mr-1" />Veículos com falhas
        </Button>
        <Button size="sm" variant={filter === "ok" ? "default" : "outline"} onClick={() => setFilter("ok")}>
          <CheckCircle2 className="size-3 mr-1" />OS ok
        </Button>
        <Button size="sm" variant={filter === "todos" ? "default" : "outline"} onClick={() => setFilter("todos")}>
          <Clock className="size-3 mr-1" />Todos
        </Button>
      </Card>

      {loading && <Card className="p-6 text-sm text-muted-foreground text-center">Carregando…</Card>}
      {!loading && rows.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">Nenhum checklist nesta categoria.</Card>}
      <div className="space-y-2">
        {rows.map((c) => (
          <Card key={c.id} className={`p-4 transition ${c.has_issues ? "border-l-4 border-l-destructive" : "border-l-4 border-l-emerald-500"}`}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-bold flex items-center gap-2 flex-wrap text-sm">
                  <span>{c.vehicle?.plate ?? "—"}</span>
                  {c.vehicle?.model && <span className="text-muted-foreground font-normal">• {c.vehicle.model}</span>}
                  
                  {/* Se tem OS atrelada, mostra a TAG AZUL com o número exato da Ordem */}
                  {c.linked_os
                    ? <span className="text-[10px] uppercase bg-blue-500/15 text-blue-600 px-2 py-0.5 rounded flex items-center gap-1"><CheckCircle2 className="size-3" /> {c.linked_os.number} Aberta</span>
                    : c.has_issues
                    ? <span className="text-[10px] uppercase bg-destructive/15 text-destructive px-2 py-0.5 rounded">Com falhas</span>
                    : <span className="text-[10px] uppercase bg-emerald-500/15 text-emerald-600 px-2 py-0.5 rounded">OK</span>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Motorista: {c.driver_name} • {new Date(c.created_at).toLocaleString("pt-BR")}</div>
                
                {c.has_issues && c.failures && c.failures.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {c.failures.map((f) => (
                      <button 
                        key={f.id} 
                        onClick={() => setSelectedFailure({ item: f.item_name, obs: f.observation ?? "", photo_url: f.photo_url })} 
                        className="w-full text-left p-2 bg-destructive/5 hover:bg-destructive/10 transition rounded border border-destructive/10 flex items-center justify-between"
                      >
                        <span className="text-xs"><span className="font-medium text-destructive/90">{f.item_name}</span>{f.observation && <span className="text-muted-foreground"> — {f.observation}</span>}</span>
                        {f.photo_url && <Search className="size-3 text-destructive/60 shrink-0 ml-2" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {/* O botão 'Abrir OS' só aparece se a OS ainda não foi gerada! */}
              {c.has_issues && !c.linked_os && (
                <Button size="sm" variant="outline" className="border-primary/50 hover:bg-primary/10" onClick={() => onOpenOSFromChecklist(c)}>
                  <FilePlus className="size-3 mr-1" />Abrir OS
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      {selectedFailure && <FailurePhotoModal failure={selectedFailure} onClose={() => setSelectedFailure(null)} />}
    </div>
  );
}

function OrderModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const { user, isMaster } = useAuth();
  const [status, setStatus] = useState(order.status);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
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
  const [photos, setPhotos] = useState<Array<{ id: string; category: "falha"|"execucao"|"conclusao"|"orcamento"; storage_path: string; caption: string | null; url: string; created_at: string }>>([]);
  const [uploadingCat, setUploadingCat] = useState<null | "falha" | "execucao" | "conclusao" | "orcamento">(null);
  
  const isLocked = order.status === "aguardando_aprovacao" && !isMaster;

  const fileRefs = {
    falha: useRef<HTMLInputElement>(null),
    execucao: useRef<HTMLInputElement>(null),
    conclusao: useRef<HTMLInputElement>(null),
    orcamento: useRef<HTMLInputElement>(null),
  };

  const loadPhotos = async () => {
    const { data, error } = await (supabase as any).from("maintenance_photos").select("id, category, storage_path, caption, created_at").eq("order_id", order.id).order("created_at", { ascending: true });
    if (error) return;
    const rows = (data ?? []) as any[];
    const withUrls = await Promise.all(rows.map(async (r) => {
      const { data: signed } = await supabase.storage.from("maintenance-photos").createSignedUrl(r.storage_path, 3600);
      return { ...r, url: signed?.signedUrl ?? "" };
    }));
    setPhotos(withUrls);
  };
  useEffect(() => { loadPhotos(); /* eslint-disable-next-line */ }, [order.id]);

  const uploadPhoto = async (cat: "falha" | "execucao" | "conclusao" | "orcamento", file: File) => {
    if (isLocked) return;
    setUploadingCat(cat);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${order.id}/${cat}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("maintenance-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("maintenance_photos").insert({ order_id: order.id, category: cat, storage_path: path, uploaded_by: user?.id ?? null });
      if (insErr) throw insErr;
      await loadPhotos();
      toast.success("Arquivo enviado com sucesso!");
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploadingCat(null); }
  };

  const deletePhoto = async (p: { id: string; storage_path: string }) => {
    if (IS_DONE_STATUS(status as any) || isLocked) { toast.error("OS bloqueada para alterações"); return; }
    if (!confirm("Excluir este anexo?")) return;
    await supabase.storage.from("maintenance-photos").remove([p.storage_path]);
    await (supabase as any).from("maintenance_photos").delete().eq("id", p.id);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
  };

  useEffect(() => { (async () => {
    const { data } = await supabase.from("maintenance_evolutions").select("id, created_at, status, observation, user_id").eq("order_id", order.id).order("created_at", { ascending: false });
    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: dd } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameById = Object.fromEntries((dd ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setEvolutions(rows.map((r) => ({ ...r, user_name: r.user_id ? nameById[r.user_id] ?? null : null })));
  })(); }, [order.id]);

  const save = async () => {
    if (isLocked) return;
    const err = validateSavePayload(status, finalObs, photos, laborDesc, partsNeeded);
    if (err) return toast.error(err);
    
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
        ...(IS_DONE_STATUS(status as any) ? { signed_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase.from("maintenance_orders").update(payload).eq("id", order.id);
      if (error) throw error;
      const obs = evoNote.trim() || `Status atualizado para "${statusLabel(status as any)}"`;
      await supabase.from("maintenance_evolutions").insert({ order_id: order.id, user_id: user?.id ?? null, status, observation: obs });
      toast.success("OS atualizada com sucesso");
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
        
        {order.status === "aguardando_aprovacao" && (
          <div className="rounded-md border border-yellow-200 bg-yellow-500/10 p-3 text-xs text-yellow-900 font-semibold">
            Esta ordem aguarda aprovação de um usuário Master. O formulário está bloqueado para alterações.
          </div>
        )}

        {order.failure_description && (
          <div><Label className="text-xs">Falha relatada</Label><div className="text-sm p-2 bg-muted rounded">{order.failure_description}</div></div>
        )}
        
        <fieldset disabled={isLocked} className="space-y-3 disabled:opacity-75">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <div><Label className="text-xs">Status</Label>
              <select 
                value={status} 
                disabled={isLocked}
                onChange={(e) => {
                  const val = e.target.value as MaintenanceStatus;
                  setStatus(val);
                  if (val === "aguardando_aprovacao") setShowBudgetModal(true);
                }} 
                className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
              >
                {STATUS_OPTIONS.filter((o) => isMaster || !FINAL_STATUSES.includes(o.value as any) || o.value === status).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><Label className="text-xs">KM atual</Label><Input value={km} onChange={(e) => setKm(e.target.value)} type="number" /></div>
            <div><Label className="text-xs">Validade do óleo</Label><Input value={oleo} onChange={(e) => setOleo(e.target.value)} placeholder="KM ou data" /></div>
            <div><Label className="text-xs">Data saída</Label><Input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} /></div>
            <div><Label className="text-xs">Hora saída</Label><Input type="time" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} /></div>
          </div>

          {NEEDS_LABOR_BUDGET(status as any) && (
            <Card className="p-3 space-y-2 bg-indigo-500/5 border-indigo-500/20">
              <div className="font-semibold text-xs">Orçamento de mão de obra *</div>
              <div><Label className="text-xs">Descrição da mão de obra</Label><Textarea rows={2} value={laborDesc} onChange={(e) => setLaborDesc(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Horas previstas</Label><Input type="number" step="0.5" value={laborHours} onChange={(e) => setLaborHours(e.target.value)} /></div>
                <div><Label className="text-xs">Valor estimado (R$)</Label><Input type="number" step="0.01" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} /></div>
              </div>
            </Card>
          )}

          {NEEDS_PARTS_BUDGET(status as any) && (
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

          {IS_DONE_STATUS(status as any) && (
            <div><Label className="text-xs">Observação final do mecânico *</Label><Textarea rows={2} value={finalObs} onChange={(e) => setFinalObs(e.target.value)} placeholder="Obrigatória para concluir a OS" /></div>
          )}

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="font-semibold text-sm flex items-center gap-2"><Camera className="size-4" />Anexos da OS</div>
            {(["falha", "orcamento", "execucao", "conclusao"] as const).map((cat) => {
              const label = cat === "falha" ? "Falha" : cat === "execucao" ? "Execução" : cat === "orcamento" ? "Orçamento" : "Conclusão";
              const list = photos.filter((p) => p.category === cat);
              return (
                <div key={cat} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{label} {cat === "conclusao" && <span className="text-destructive">*</span>}</span>
                    <input ref={fileRefs[cat]} type="file" accept="image/*,.pdf" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(cat, f); e.target.value = ""; }} />
                    <Button size="sm" variant="outline" disabled={uploadingCat === cat || IS_DONE_STATUS(status as any) || isLocked} onClick={() => fileRefs[cat].current?.click()}>
                      <Camera className="size-3 mr-1" />{uploadingCat === cat ? "Enviando…" : "Adicionar"}
                    </Button>
                  </div>
                  {list.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">Sem anexos.</div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {list.map((p) => {
                        const isPdf = p.storage_path.endsWith(".pdf");
                        return (
                          <div key={p.id} className="relative group aspect-square rounded overflow-hidden bg-muted flex items-center justify-center border border-border">
                            <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center justify-center w-full h-full">
                              {isPdf ? <span className="text-[10px] font-bold text-blue-500 underline text-center px-1">Abrir PDF</span> : <img src={p.url} alt={label} className="w-full h-full object-cover" loading="lazy" />}
                            </a>
                            {!IS_DONE_STATUS(status as any) && !isLocked && (
                              <button type="button" onClick={() => deletePhoto(p)} className="absolute top-1 right-1 bg-black/60 text-white rounded p-1 opacity-0 group-hover:opacity-100 transition">
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="text-[11px] text-muted-foreground">Pelo menos 1 foto de Conclusão é obrigatória para finalizar a OS.</div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="font-semibold text-sm">Evolução da manutenção</div>
            <Textarea rows={2} value={evoNote} disabled={isLocked} onChange={(e) => setEvoNote(e.target.value)} placeholder={isLocked ? "OS Bloqueada" : "Observação desta atualização (opcional)"} />
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
        </fieldset>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy || isLocked}>{busy ? "..." : IS_DONE_STATUS(status as any) ? "Concluir OS" : "Salvar"}</Button>
        </div>
      </Card>
      
      {showBudgetModal && (
        <BudgetUploadModal 
          busy={uploadingCat === "orcamento"}
          onClose={() => setShowBudgetModal(false)} 
          onConfirm={(file) => { uploadPhoto("orcamento", file); setShowBudgetModal(false); }} 
        />
      )}
    </div>
  );
}

type VehicleOpt = { id: string; plate: string | null; model: string | null; base: string | null };

function NewOrderModal({ onClose, onCreated, presetChecklist }: { onClose: () => void; onCreated: () => void; presetChecklist?: ChecklistRow | null }) {
  const { user } = useAuth();
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [vehicleId, setVehicleId] = useState(presetChecklist?.vehicle_id ?? "");
  const [orderType, setOrderType] = useState<"SMI" | "SMV">("SMI");
  const [base, setBase] = useState(presetChecklist?.vehicle?.base ?? "");
  const [failure, setFailure] = useState(
    presetChecklist?.failures?.length
      ? presetChecklist.failures.map((f) => `• ${f.item_name}${f.observation ? `: ${f.observation}` : ""}`).join("\n")
      : ""
  );
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
      
      // Removida a tentativa de update em checklists para evitar falhas de RLS.
      // O frontend agora é inteligente e descobre sozinho se existe uma OS!
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
        driver_id: presetChecklist?.driver_id ?? null,
        checklist_id: presetChecklist?.id ?? null,
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