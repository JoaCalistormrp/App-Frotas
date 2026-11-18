import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Wrench, Plus, ClipboardList, Clock, AlertTriangle, FilePlus, Trash2, Search, X as XIcon, ChevronRight, Camera } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { DONE_STATUSES, IS_STOPPED_STATUS, OPEN_STATUSES, statusAccent, timeAgo, type MaintenanceStatus } from "@/lib/maintenance";
import { StageProgress, StatusBadge, TypeBadge } from "@/components/maintenance-ui";

export const Route = createFileRoute("/admin/maintenance")({ component: MaintenancePage });

type Order = {
  id: string; order_number: string; order_type: string; base_code: string; status: MaintenanceStatus;
  failure_description: string | null; workshop: string | null; created_at: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  driver_name?: string | null;
};

type LinkedOrder = { id: string; order_number: string; status: MaintenanceStatus };

type StatusFilter = "abertos" | "aprovacao" | "concluidas" | "encerradas" | "todos";
type TypeFilter = "todos" | "SMI" | "SMV";

const STATUS_FILTERS: { key: StatusFilter; label: string; match: (s: string) => boolean }[] = [
  { key: "abertos",    label: "Em aberto",          match: (s) => OPEN_STATUSES.includes(s as MaintenanceStatus) },
  { key: "aprovacao",  label: "Aguard. aprovação",  match: (s) => s === "aguardando_aprovacao" },
  { key: "concluidas", label: "Concluídas",         match: (s) => DONE_STATUSES.includes(s as MaintenanceStatus) },
  { key: "encerradas", label: "Negadas/canceladas", match: (s) => IS_STOPPED_STATUS(s) },
  { key: "todos",      label: "Todas",              match: () => true },
];

const FAILURE_WINDOW_DAYS = 30;
const failureWindowStart = () => new Date(Date.now() - FAILURE_WINDOW_DAYS * 864e5).toISOString();

function matchesSearch(o: Order, q: string) {
  return [o.order_number, o.vehicles?.plate, o.vehicles?.model, o.driver_name, o.failure_description, o.workshop, o.base_code]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

function MaintenancePage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { isAdmin, isMaster, modules } = useAuth();
  const canSeeTrash = isAdmin || modules.includes("frotas") || modules.includes("frotas.lixeira");
  const [tab, setTab] = useState<"orders" | "checklists">("orders");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("abertos");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [search, setSearch] = useState("");
  const [pendingFailures, setPendingFailures] = useState(0);

  const isChild = path.startsWith("/admin/maintenance/") && path !== "/admin/maintenance/";

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: cks }] = await Promise.all([
      supabase
        .from("maintenance_orders")
        .select("id, order_number, order_type, base_code, status, failure_description, workshop, created_at, vehicle_id, driver_id, checklist_id, vehicles(plate, model)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("checklists").select("id").eq("has_issues", true).gte("created_at", failureWindowStart()).limit(1000),
    ]);
    if (error) { toast.error("Erro ao carregar as OS: " + error.message); setLoading(false); return; }

    const rows = (data ?? []) as unknown as Order[];
    const driverIds = Array.from(new Set(rows.map((r) => r.driver_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setOrders(rows.map((r) => ({ ...r, driver_name: r.driver_id ? nameById[r.driver_id] ?? null : null })));

    const linked = new Set(rows.map((r) => r.checklist_id).filter(Boolean));
    setPendingFailures((cks ?? []).filter((c) => !linked.has(c.id)).length);
    setLoading(false);
  };

  useEffect(() => {
    if (!isChild) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChild]);

  if (isChild) return <Outlet />;

  const ordersByChecklist: Record<string, LinkedOrder> = {};
  for (const o of orders) {
    if (o.checklist_id && !ordersByChecklist[o.checklist_id]) {
      ordersByChecklist[o.checklist_id] = { id: o.id, order_number: o.order_number, status: o.status };
    }
  }

  const byType = orders.filter((o) => typeFilter === "todos" || o.order_type === typeFilter);
  const counts = Object.fromEntries(
    STATUS_FILTERS.map((f) => [f.key, byType.filter((o) => f.match(o.status)).length]),
  ) as Record<StatusFilter, number>;
  const active = STATUS_FILTERS.find((f) => f.key === statusFilter) ?? STATUS_FILTERS[0];
  const q = search.trim().toLowerCase();
  const searched = q ? byType.filter((o) => matchesSearch(o, q)) : byType;
  const visible = searched.filter((o) => active.match(o.status));
  const hiddenMatches = q ? searched.length - visible.length : 0;
  const awaitingApproval = orders.filter((o) => o.status === "aguardando_aprovacao").length;

  const showApprovals = () => { setTab("orders"); setTypeFilter("todos"); setSearch(""); setStatusFilter("aprovacao"); };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="size-6" />Manutenção</h1>
          <p className="text-sm text-muted-foreground">Ordens de serviço (SMI/SMV) e falhas vindas dos checklists</p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeTrash && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/maintenance/trash"><Trash2 />Lixeira</Link>
            </Button>
          )}
          <Button asChild>
            <Link to="/admin/maintenance/$id" params={{ id: "new" }}><Plus />Nova OS</Link>
          </Button>
        </div>
      </div>

      {!loading && (pendingFailures > 0 || awaitingApproval > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {pendingFailures > 0 && (
            <AttentionCard
              tone="red"
              icon={AlertTriangle}
              title={`${pendingFailures} falha${pendingFailures > 1 ? "s" : ""} de checklist sem OS`}
              text={`Registradas nos últimos ${FAILURE_WINDOW_DAYS} dias`}
              action="Ver falhas"
              onClick={() => setTab("checklists")}
            />
          )}
          {awaitingApproval > 0 && (
            <AttentionCard
              tone="yellow"
              icon={Clock}
              title={`${awaitingApproval} OS aguardando ${isMaster ? "sua aprovação" : "aprovação"}`}
              text={isMaster ? "Revise o orçamento e aprove ou negue" : "Aguardando decisão de um usuário Master"}
              action="Ver"
              onClick={showApprovals}
            />
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as "orders" | "checklists")}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="orders" className="flex-1 sm:flex-none sm:px-6">
            <Wrench className="size-4 mr-2" /><span className="sm:hidden">Ordens</span><span className="hidden sm:inline">Ordens de serviço</span>
          </TabsTrigger>
          <TabsTrigger value="checklists" className="flex-1 sm:flex-none sm:px-6">
            <ClipboardList className="size-4 mr-2" /><span className="sm:hidden">Falhas</span><span className="hidden sm:inline">Falhas de checklist</span>
            {pendingFailures > 0 && (
              <span className="ml-2 min-w-5 h-5 px-1.5 rounded-full bg-destructive text-white text-[10px] font-bold grid place-items-center">{pendingFailures}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-3 pt-2">
          <div className="flex gap-2">
            <SearchBox value={search} onChange={setSearch} placeholder="Buscar placa, OS, motorista…" />
            <Segmented
              value={typeFilter}
              onChange={setTypeFilter}
              options={[["todos", "Todas"], ["SMI", "SMI"], ["SMV", "SMV"]]}
              label="Tipo de OS"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]" role="group" aria-label="Filtrar por situação">
            {STATUS_FILTERS.map((f) => {
              const on = statusFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStatusFilter(f.key)}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 h-9 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border hover:bg-muted",
                  )}
                >
                  {f.label}
                  <span className={cn("min-w-5 rounded-full px-1.5 text-[10px] font-bold", on ? "bg-white/20" : "bg-muted text-muted-foreground")}>
                    {counts[f.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <ListSkeleton />
          ) : visible.length === 0 ? (
            <Card className="p-8 text-center space-y-3">
              <div className="mx-auto size-10 rounded-full bg-muted grid place-items-center"><Wrench className="size-5 text-muted-foreground" /></div>
              <p className="text-sm text-muted-foreground">
                {q ? `Nenhuma OS "${active.label.toLowerCase()}" encontrada para "${search.trim()}".` : `Nenhuma OS em "${active.label}".`}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {hiddenMatches > 0 && (
                  <Button size="sm" variant="outline" onClick={() => setStatusFilter("todos")}>
                    Ver {hiddenMatches} resultado{hiddenMatches > 1 ? "s" : ""} em Todas
                  </Button>
                )}
                {!q && statusFilter === "abertos" && (
                  <Button asChild size="sm"><Link to="/admin/maintenance/$id" params={{ id: "new" }}><Plus />Abrir nova OS</Link></Button>
                )}
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {visible.map((o) => <OrderCard key={o.id} order={o} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="checklists" className="pt-2">
          <FailuresPanel ordersByChecklist={ordersByChecklist} ordersLoaded={!loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AttentionCard({ tone, icon: Icon, title, text, action, onClick }: {
  tone: "red" | "yellow"; icon: ComponentType<{ className?: string }>; title: string; text: string; action: string; onClick: () => void;
}) {
  return (
    <Card className={cn(
      "p-3 flex items-center gap-3",
      tone === "red" ? "border-destructive/30 bg-destructive/5" : "border-yellow-500/40 bg-yellow-500/10",
    )}>
      <div className={cn("size-9 rounded-full grid place-items-center shrink-0", tone === "red" ? "bg-destructive/10 text-destructive" : "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400")}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{text}</div>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={onClick}>{action}</Button>
    </Card>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative flex-1 min-w-0">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 pr-9" aria-label={placeholder} />
      {value && (
        <button type="button" aria-label="Limpar busca" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-md border border-border bg-muted/50 p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-8 px-2.5 sm:px-3 rounded text-xs font-medium transition-colors",
            value === v ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  const meta = [o.driver_name && `Motorista: ${o.driver_name}`, o.workshop && `Oficina: ${o.workshop}`].filter(Boolean).join(" · ");
  return (
    <Link to="/admin/maintenance/$id" params={{ id: o.id }} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className={cn("p-4 h-full border-l-4 transition-colors group-hover:bg-muted/40", statusAccent(o.status))}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-primary">{o.order_number}</span>
              <TypeBadge type={o.order_type} />
              <StatusBadge status={o.status} />
            </div>
            <div className="text-sm font-semibold truncate">
              {o.vehicles?.plate ?? "Sem veículo"}
              {o.vehicles?.model && <span className="font-normal text-muted-foreground"> · {o.vehicles.model}</span>}
            </div>
            {o.failure_description && <p className="text-xs text-muted-foreground line-clamp-1">{o.failure_description}</p>}
            {meta && <p className="text-[11px] text-muted-foreground truncate">{meta}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              <StageProgress status={o.status} />
              <span className="text-[11px] text-muted-foreground shrink-0" title={new Date(o.created_at).toLocaleString("pt-BR")}>
                {timeAgo(o.created_at)}
              </span>
            </div>
          </div>
          <ChevronRight className="size-4 text-muted-foreground shrink-0 mt-1 transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}

function ListSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
    </div>
  );
}

// --- Foto de uma falha do checklist ---
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
          <h3 className="font-bold text-base text-destructive">Detalhe da falha</h3>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><XIcon className="size-4" /></Button>
        </div>
        <div className="font-bold text-sm">{failure.item}</div>
        {failure.obs && <div className="text-sm text-muted-foreground">{failure.obs}</div>}
        {loading && <div className="text-xs text-muted-foreground">Carregando foto…</div>}
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

// --- Falhas vindas dos checklists ---
type FailureFilter = "sem_os" | "com_os" | "todas";

type ChecklistRow = {
  id: string; vehicle_id: string; driver_id: string; created_at: string;
  vehicle?: { plate: string | null; model: string | null; base: string | null } | null;
  driver_name?: string | null;
  failures: Array<{ id: string; item_name: string; observation: string | null; photo_url: string | null }>;
};

function FailuresPanel({ ordersByChecklist, ordersLoaded }: { ordersByChecklist: Record<string, LinkedOrder>; ordersLoaded: boolean }) {
  const [filter, setFilter] = useState<FailureFilter>("sem_os");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFailure, setSelectedFailure] = useState<SelectedFailure | null>(null);
  const [search, setSearch] = useState("");

  const linkedIds = Object.keys(ordersByChecklist);
  const linkedKey = linkedIds.join(",");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("checklists")
      .select("id, vehicle_id, driver_id, created_at")
      .eq("has_issues", true)
      .order("created_at", { ascending: false });
    if (filter === "sem_os") q = q.gte("created_at", failureWindowStart()).limit(300);
    else if (filter === "com_os") {
      if (!linkedIds.length) { setRows([]); setLoading(false); return; }
      q = q.in("id", linkedIds.slice(0, 150));
    } else q = q.limit(80);

    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }

    let list = (data ?? []) as Array<{ id: string; vehicle_id: string; driver_id: string; created_at: string }>;
    if (filter === "sem_os") list = list.filter((c) => !ordersByChecklist[c.id]);

    const vehicleIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean)));
    const driverIds = Array.from(new Set(list.map((r) => r.driver_id).filter(Boolean)));
    const ids = list.map((r) => r.id);

    const [{ data: vs }, { data: ds }, { data: resps }] = await Promise.all([
      vehicleIds.length ? supabase.from("vehicles").select("id, plate, model, base").in("id", vehicleIds) : Promise.resolve({ data: [] }),
      driverIds.length ? supabase.from("profiles").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from("checklist_responses").select("id, checklist_id, item_id, observation, photo_url").in("checklist_id", ids).eq("status", "NAO_OK")
        : Promise.resolve({ data: [] }),
    ]);

    const vById = Object.fromEntries(((vs ?? []) as Array<{ id: string; plate: string | null; model: string | null; base: string | null }>).map((v) => [v.id, v]));
    const dById = Object.fromEntries(((ds ?? []) as Array<{ id: string; full_name: string | null }>).map((d) => [d.id, d.full_name ?? "—"]));
    const responses = (resps ?? []) as Array<{ id: string; checklist_id: string; item_id: string; observation: string | null; photo_url: string | null }>;

    const itemIds = Array.from(new Set(responses.map((r) => r.item_id)));
    let itemById: Record<string, string> = {};
    if (itemIds.length) {
      const { data: items } = await supabase.from("checklist_items").select("id, name").in("id", itemIds);
      itemById = Object.fromEntries((items ?? []).map((it) => [it.id, it.name]));
    }

    const failuresBy: Record<string, ChecklistRow["failures"]> = {};
    for (const r of responses) {
      (failuresBy[r.checklist_id] ||= []).push({ id: r.id, item_name: itemById[r.item_id] ?? "Item", observation: r.observation, photo_url: r.photo_url });
    }

    setRows(list.map((r) => ({ ...r, vehicle: vById[r.vehicle_id] ?? null, driver_name: dById[r.driver_id] ?? "—", failures: failuresBy[r.id] ?? [] })));
    setLoading(false);
  };

  useEffect(() => {
    if (ordersLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, linkedKey, ordersLoaded]);

  const q = search.trim().toLowerCase();
  const visible = q
    ? rows.filter((c) => [c.vehicle?.plate, c.vehicle?.model, c.driver_name, ...c.failures.map((f) => f.item_name)].some((v) => (v ?? "").toLowerCase().includes(q)))
    : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar placa, motorista ou item…" />
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[["sem_os", `Sem OS · ${FAILURE_WINDOW_DAYS} dias`], ["com_os", "Com OS"], ["todas", "Todas"]]}
          label="Filtrar falhas"
        />
      </div>

      {loading ? (
        <ListSkeleton />
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q ? `Nenhuma falha encontrada para "${search.trim()}".`
            : filter === "sem_os" ? `Tudo em dia: nenhuma falha sem OS nos últimos ${FAILURE_WINDOW_DAYS} dias.`
            : "Nenhum checklist com falha neste filtro."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visible.map((c) => {
            const os = ordersByChecklist[c.id];
            return (
              <Card key={c.id} className={cn("p-4 border-l-4 flex flex-col gap-3", os ? "border-l-blue-500" : "border-l-destructive")}>
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{c.vehicle?.plate ?? "—"}</span>
                    {c.vehicle?.model && <span className="text-sm text-muted-foreground truncate">· {c.vehicle.model}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground" title={new Date(c.created_at).toLocaleString("pt-BR")}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Motorista: {c.driver_name}{c.vehicle?.base ? ` · ${c.vehicle.base}` : ""}
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {c.failures.length === 0 && <span className="text-xs text-muted-foreground italic">Sem itens não conformes registrados.</span>}
                  {c.failures.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFailure({ item: f.item_name, obs: f.observation ?? "", photo_url: f.photo_url })}
                      className="inline-flex items-center gap-1 max-w-full rounded-md border border-destructive/20 bg-destructive/5 hover:bg-destructive/10 px-2 py-1 text-xs text-left transition-colors"
                    >
                      {f.photo_url && <Camera className="size-3 shrink-0 text-destructive/70" />}
                      <span className="font-medium text-destructive/90 truncate">{f.item_name}</span>
                      {f.observation && <span className="text-muted-foreground truncate">— {f.observation}</span>}
                    </button>
                  ))}
                </div>

                <div className="mt-auto">
                  {os ? (
                    <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                      <Link to="/admin/maintenance/$id" params={{ id: os.id }}>
                        <Wrench />{os.order_number}<StatusBadge status={os.status} />
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="w-full sm:w-auto">
                      <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never}>
                        <FilePlus />Abrir OS desta falha
                      </Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {selectedFailure && <FailurePhotoModal failure={selectedFailure} onClose={() => setSelectedFailure(null)} />}
    </div>
  );
}
