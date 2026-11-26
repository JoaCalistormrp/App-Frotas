import { Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertTriangle, Building2, Camera, ChevronRight, ClipboardList, FilePlus, Package, Plus, Search, Trash2, Wrench, X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { canAccessPage, isOsGestor, prettyName } from "@/lib/nav";
import {
  DONE_STATUSES, IS_STOPPED_STATUS, IS_WAITING_PART, OPEN_STATUSES, statusAccent, timeAgo, type MaintenanceStatus, type OsKind,
} from "@/lib/maintenance";
import { StageProgress, StatusBadge } from "@/components/maintenance-ui";

type Order = {
  id: string; order_number: string; order_type: OsKind; base_code: string; status: MaintenanceStatus;
  failure_description: string | null; workshop: string | null; created_at: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  previsao_saida: string | null; part_requested_at: string | null; part_decided_at: string | null;
  part_arrival_due: string | null; parts_needed: string | null; valor_total: number | null;
  data_entrada: string | null; data_saida: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  driver_name?: string | null;
};
type LinkedOrder = { id: string; order_number: string; status: MaintenanceStatus; order_type: OsKind };
type FilterDef = { key: string; label: string; match: (o: Order) => boolean };

const awaitingAnswer = (o: Order) => IS_WAITING_PART(o.status) && !o.part_decided_at;

const FILTERS: Record<OsKind, FilterDef[]> = {
  SMI: [
    { key: "abertos", label: "Em aberto", match: (o) => OPEN_STATUSES.includes(o.status) },
    { key: "peca", label: "Aguardando peça", match: (o) => IS_WAITING_PART(o.status) },
    { key: "concluidas", label: "Concluídas", match: (o) => DONE_STATUSES.includes(o.status) },
    { key: "canceladas", label: "Canceladas", match: (o) => IS_STOPPED_STATUS(o.status) },
    { key: "todos", label: "Todas", match: () => true },
  ],
  SMV: [
    { key: "abertos", label: "Na oficina", match: (o) => OPEN_STATUSES.includes(o.status) },
    { key: "concluidas", label: "Concluídas", match: (o) => DONE_STATUSES.includes(o.status) },
    { key: "canceladas", label: "Canceladas", match: (o) => IS_STOPPED_STATUS(o.status) },
    { key: "todos", label: "Todas", match: () => true },
  ],
};

const FAILURE_WINDOW_DAYS = 30;
const failureWindowStart = () => new Date(Date.now() - FAILURE_WINDOW_DAYS * 864e5).toISOString();
const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function matchesSearch(o: Order, q: string) {
  return [o.order_number, o.vehicles?.plate, o.vehicles?.model, o.driver_name, o.failure_description, o.workshop, o.parts_needed]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

export function OsListPage({ kind }: { kind: OsKind }) {
  const { isAdmin, modules } = useAuth();
  const gestor = isOsGestor(modules, isAdmin);
  const canSeeTrash = gestor && (isAdmin || canAccessPage(modules, "frotas.lixeira"));
  const filters = FILTERS[kind];
  const deepLink = useSearch({ strict: false }) as { aba?: string; filtro?: string };

  const [tab, setTab] = useState<"orders" | "checklists">(() => (kind === "SMI" && deepLink.aba === "falhas" ? "checklists" : "orders"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [linked, setLinked] = useState<Record<string, LinkedOrder>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(() => (filters.some((f) => f.key === deepLink.filtro) ? deepLink.filtro! : "abertos"));
  const [search, setSearch] = useState("");
  const [pendingFailures, setPendingFailures] = useState(0);

  useEffect(() => { (async () => {
    setLoading(true);
    const [{ data, error }, { data: links }, { data: cks }] = await Promise.all([
      supabase
        .from("maintenance_orders")
        .select("id, order_number, order_type, base_code, status, failure_description, workshop, created_at, vehicle_id, driver_id, checklist_id, previsao_saida, part_requested_at, part_decided_at, part_arrival_due, parts_needed, valor_total, data_entrada, data_saida, vehicles(plate, model)")
        .eq("order_type", kind)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase.from("maintenance_orders").select("id, order_number, status, order_type, checklist_id").not("checklist_id", "is", null).is("deleted_at", null).limit(2000),
      kind === "SMI"
        ? supabase.from("checklists").select("id").eq("has_issues", true).gte("created_at", failureWindowStart()).limit(1000)
        : Promise.resolve({ data: [] as Array<{ id: string }> }),
    ]);
    if (error) { toast.error("Erro ao carregar as OS: " + error.message); setLoading(false); return; }

    const rows = (data ?? []) as unknown as Order[];
    const driverIds = Array.from(new Set(rows.map((r) => r.driver_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, prettyName(p.full_name) ?? "—"]));
    }
    setOrders(rows.map((r) => ({ ...r, driver_name: r.driver_id ? nameById[r.driver_id] ?? null : null })));

    const map: Record<string, LinkedOrder> = {};
    for (const l of (links ?? []) as Array<LinkedOrder & { checklist_id: string }>) if (!map[l.checklist_id]) map[l.checklist_id] = l;
    setLinked(map);
    setPendingFailures(((cks ?? []) as Array<{ id: string }>).filter((c) => !map[c.id]).length);
    setLoading(false);
  })(); }, [kind]);

  const counts = Object.fromEntries(filters.map((f) => [f.key, orders.filter(f.match).length]));
  const active = filters.find((f) => f.key === filter) ?? filters[0];
  const q = search.trim().toLowerCase();
  const searched = q ? orders.filter((o) => matchesSearch(o, q)) : orders;
  const visible = searched.filter(active.match);
  const hiddenMatches = q ? searched.length - visible.length : 0;
  const waitingAnswer = orders.filter(awaitingAnswer).length;
  const newOsLink = { to: "/admin/maintenance/$id" as const, params: { id: "new" }, search: (kind === "SMV" ? { tipo: "externa" } : {}) as never };

  const ordersList = (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={kind === "SMV" ? "Buscar placa, OS, oficina…" : "Buscar placa, OS, peça…"} className="pl-9 pr-9" aria-label="Buscar OS" />
          {search && (
            <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
              <XIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrar por situação">
        {filters.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
              )}
            >
              {f.label}
              <span className={cn("min-w-5 rounded-full px-1.5 text-[10px] font-bold", on ? "bg-white/20" : "bg-muted text-muted-foreground")}>{counts[f.key]}</span>
            </button>
          );
        })}
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <Card className="space-y-3 p-8 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted">{kind === "SMV" ? <Building2 className="size-5 text-muted-foreground" /> : <Wrench className="size-5 text-muted-foreground" />}</div>
          <p className="text-sm text-muted-foreground">{q ? `Nenhuma OS encontrada para "${search.trim()}" em "${active.label}".` : `Nenhuma OS em "${active.label}".`}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {hiddenMatches > 0 && <Button size="sm" variant="outline" onClick={() => setFilter("todos")}>Ver {hiddenMatches} resultado{hiddenMatches > 1 ? "s" : ""} em Todas</Button>}
            {!q && filter === "abertos" && (kind === "SMI" || gestor) && (
              <Button asChild size="sm"><Link {...newOsLink}><Plus />Abrir nova OS</Link></Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visible.map((o) => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {kind === "SMV" ? <Building2 className="size-6" /> : <Wrench className="size-6" />}
            {kind === "SMV" ? "OS externas" : "OS internas"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {kind === "SMV" ? "OS emitidas por oficinas externas — anexe o documento da oficina" : "Oficina Grupo Tomaz — mecânico e Frotas ADM"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canSeeTrash && <Button asChild variant="ghost" size="sm"><Link to="/admin/maintenance/trash"><Trash2 />Lixeira</Link></Button>}
          {(kind === "SMI" || gestor) && <Button asChild><Link {...newOsLink}><Plus />{kind === "SMV" ? "Registrar OS externa" : "Nova OS"}</Link></Button>}
        </div>
      </div>

      {!loading && kind === "SMI" && (pendingFailures > 0 || waitingAnswer > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {waitingAnswer > 0 && (
            <AttentionCard
              tone="warning"
              icon={Package}
              title={gestor ? `${waitingAnswer} pedido${waitingAnswer > 1 ? "s" : ""} de peça aguardando sua resposta` : `${waitingAnswer} OS aguardando resposta do Frotas ADM`}
              text={gestor ? "Informe a previsão de compra e chegada, ou cancele a OS" : "Pedido de peça enviado; aguarde o prazo"}
              action="Ver"
              onClick={() => { setTab("orders"); setSearch(""); setFilter("peca"); }}
            />
          )}
          {pendingFailures > 0 && (
            <AttentionCard
              tone="critical"
              icon={AlertTriangle}
              title={`${pendingFailures} falha${pendingFailures > 1 ? "s" : ""} de checklist sem OS`}
              text={`Registradas nos últimos ${FAILURE_WINDOW_DAYS} dias`}
              action="Ver falhas"
              onClick={() => setTab("checklists")}
            />
          )}
        </div>
      )}

      {kind === "SMI" ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as "orders" | "checklists")}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="orders" className="flex-1 sm:flex-none sm:px-6"><Wrench className="mr-2 size-4" />Ordens</TabsTrigger>
            <TabsTrigger value="checklists" className="flex-1 sm:flex-none sm:px-6">
              <ClipboardList className="mr-2 size-4" /><span className="sm:hidden">Falhas</span><span className="hidden sm:inline">Falhas de checklist</span>
              {pendingFailures > 0 && <span className="ml-2 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-white">{pendingFailures}</span>}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="pt-2">{ordersList}</TabsContent>
          <TabsContent value="checklists" className="pt-2"><FailuresPanel linked={linked} ordersLoaded={!loading} /></TabsContent>
        </Tabs>
      ) : ordersList}
    </div>
  );
}

function AttentionCard({ tone, icon: Icon, title, text, action, onClick }: {
  tone: "critical" | "warning"; icon: ComponentType<{ className?: string }>; title: string; text: string; action: string; onClick: () => void;
}) {
  return (
    <Card className={cn("flex items-center gap-3 p-3", tone === "critical" ? "border-destructive/30 bg-destructive/5" : "border-amber-500/40 bg-amber-500/10")}>
      <div className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone === "critical" ? "bg-destructive/10 text-destructive" : "bg-amber-500/20 text-amber-700 dark:text-amber-400")}>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-tight">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{text}</div>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={onClick}>{action}</Button>
    </Card>
  );
}

function OrderCard({ order: o }: { order: Order }) {
  const internal = o.order_type === "SMI";
  const details = internal
    ? [o.driver_name && `Motorista: ${o.driver_name}`, o.previsao_saida && `Saída prevista ${fmtDate(o.previsao_saida)}`].filter(Boolean).join(" · ")
    : [o.workshop, o.valor_total != null && brl(Number(o.valor_total)), o.data_entrada && `Entrada ${fmtDate(o.data_entrada)}`, o.data_saida && `Saída ${fmtDate(o.data_saida)}`].filter(Boolean).join(" · ");
  return (
    <Link to="/admin/maintenance/$id" params={{ id: o.id }} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className={cn("h-full border-l-4 p-4 transition-colors group-hover:bg-muted/40", statusAccent(o.status))}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-primary">{o.order_number}</span>
              <StatusBadge status={o.status} kind={o.order_type} />
            </div>
            <div className="truncate text-sm font-semibold">
              {o.vehicles?.plate ?? "Sem veículo"}
              {o.vehicles?.model && <span className="font-normal text-muted-foreground"> · {o.vehicles.model}</span>}
            </div>
            {o.failure_description && <p className="line-clamp-1 text-xs text-muted-foreground">{o.failure_description}</p>}
            {internal && IS_WAITING_PART(o.status) && (
              <p className="flex items-center gap-1.5 truncate rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">
                <Package className="size-3.5 shrink-0" />
                <span className="truncate">
                  {o.parts_needed ?? "Peça"} · {o.part_decided_at ? (o.part_arrival_due ? `chegada prevista ${fmtDate(o.part_arrival_due)}` : "compra autorizada") : "aguardando resposta do Frotas ADM"}
                </span>
              </p>
            )}
            {details && <p className="truncate text-[11px] text-muted-foreground">{details}</p>}
            <div className="flex items-center justify-between gap-2 pt-1">
              <StageProgress status={o.status} kind={o.order_type} />
              <span className="shrink-0 text-[11px] text-muted-foreground" title={new Date(o.created_at).toLocaleString("pt-BR")}>{timeAgo(o.created_at)}</span>
            </div>
          </div>
          <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}

// --- Falhas vindas dos checklists (OS interna) ---
type SelectedFailure = { item: string; obs: string; photo_url: string | null };

function FailurePhotoModal({ failure, onClose }: { failure: SelectedFailure; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!failure.photo_url);
  useEffect(() => {
    if (!failure.photo_url) return;
    let alive = true;
    supabase.storage.from("checklist-photos").createSignedUrl(failure.photo_url, 3600).then(({ data }) => {
      if (alive) { setUrl(data?.signedUrl ?? null); setLoading(false); }
    });
    return () => { alive = false; };
  }, [failure.photo_url]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <Card role="dialog" aria-modal="true" className="w-full max-w-sm space-y-3 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-base font-bold text-destructive">Detalhe da falha</h3>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><XIcon className="size-4" /></Button>
        </div>
        <div className="text-sm font-bold">{failure.item}</div>
        {failure.obs && <div className="text-sm text-muted-foreground">{failure.obs}</div>}
        {loading && <div className="text-xs text-muted-foreground">Carregando foto…</div>}
        {url && <a href={url} target="_blank" rel="noreferrer" className="mt-2 block"><img src={url} alt="Evidência" className="h-auto max-h-64 w-full rounded border border-border object-cover" /></a>}
        {!failure.photo_url && <div className="mt-2 text-xs italic text-muted-foreground">Sem foto anexada.</div>}
      </Card>
    </div>
  );
}

type FailureFilter = "sem_os" | "com_os" | "todas";
type ChecklistRow = {
  id: string; vehicle_id: string; driver_id: string; created_at: string;
  vehicle?: { plate: string | null; model: string | null; base: string | null } | null;
  driver_name?: string | null;
  failures: Array<{ id: string; item_name: string; observation: string | null; photo_url: string | null }>;
};

function FailuresPanel({ linked, ordersLoaded }: { linked: Record<string, LinkedOrder>; ordersLoaded: boolean }) {
  const [filter, setFilter] = useState<FailureFilter>("sem_os");
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SelectedFailure | null>(null);
  const [search, setSearch] = useState("");
  const linkedIds = Object.keys(linked);
  const linkedKey = linkedIds.join(",");

  const load = async () => {
    setLoading(true);
    let q = supabase.from("checklists").select("id, vehicle_id, driver_id, created_at").eq("has_issues", true).order("created_at", { ascending: false });
    if (filter === "sem_os") q = q.gte("created_at", failureWindowStart()).limit(300);
    else if (filter === "com_os") {
      if (!linkedIds.length) { setRows([]); setLoading(false); return; }
      q = q.in("id", linkedIds.slice(0, 150));
    } else q = q.limit(80);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }
    let list = (data ?? []) as Array<{ id: string; vehicle_id: string; driver_id: string; created_at: string }>;
    if (filter === "sem_os") list = list.filter((c) => !linked[c.id]);

    const vehicleIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean)));
    const driverIds = Array.from(new Set(list.map((r) => r.driver_id).filter(Boolean)));
    const ids = list.map((r) => r.id);
    const [{ data: vs }, { data: ds }, { data: resps }] = await Promise.all([
      vehicleIds.length ? supabase.from("vehicles").select("id, plate, model, base").in("id", vehicleIds) : Promise.resolve({ data: [] }),
      driverIds.length ? supabase.from("profiles").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] }),
      ids.length ? supabase.from("checklist_responses").select("id, checklist_id, item_id, observation, photo_url").in("checklist_id", ids).eq("status", "NAO_OK") : Promise.resolve({ data: [] }),
    ]);
    const vById = Object.fromEntries(((vs ?? []) as Array<{ id: string; plate: string | null; model: string | null; base: string | null }>).map((v) => [v.id, v]));
    const dById = Object.fromEntries(((ds ?? []) as Array<{ id: string; full_name: string | null }>).map((d) => [d.id, prettyName(d.full_name) ?? "—"]));
    const responses = (resps ?? []) as Array<{ id: string; checklist_id: string; item_id: string; observation: string | null; photo_url: string | null }>;
    const itemIds = Array.from(new Set(responses.map((r) => r.item_id)));
    let itemById: Record<string, string> = {};
    if (itemIds.length) {
      const { data: items } = await supabase.from("checklist_items").select("id, name").in("id", itemIds);
      itemById = Object.fromEntries((items ?? []).map((it) => [it.id, it.name]));
    }
    const failuresBy: Record<string, ChecklistRow["failures"]> = {};
    for (const r of responses) (failuresBy[r.checklist_id] ||= []).push({ id: r.id, item_name: itemById[r.item_id] ?? "Item", observation: r.observation, photo_url: r.photo_url });
    setRows(list.map((r) => ({ ...r, vehicle: vById[r.vehicle_id] ?? null, driver_name: dById[r.driver_id] ?? "—", failures: failuresBy[r.id] ?? [] })));
    setLoading(false);
  };

  useEffect(() => {
    if (ordersLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, linkedKey, ordersLoaded]);

  const q = search.trim().toLowerCase();
  const visible = q ? rows.filter((c) => [c.vehicle?.plate, c.vehicle?.model, c.driver_name, ...c.failures.map((f) => f.item_name)].some((v) => (v ?? "").toLowerCase().includes(q))) : rows;
  const FILTER_OPTS: Array<[FailureFilter, string]> = [["sem_os", `Sem OS · ${FAILURE_WINDOW_DAYS} dias`], ["com_os", "Com OS"], ["todas", "Todas"]];

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar placa, motorista ou item…" className="pl-9" aria-label="Buscar falhas" />
        </div>
        <div role="group" aria-label="Filtrar falhas" className="inline-flex shrink-0 rounded-md border border-border bg-muted/50 p-0.5">
          {FILTER_OPTS.map(([v, l]) => (
            <button key={v} type="button" aria-pressed={filter === v} onClick={() => setFilter(v)}
              className={cn("h-8 rounded px-2.5 text-xs font-medium transition-colors sm:px-3", filter === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      ) : visible.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {q ? `Nenhuma falha encontrada para "${search.trim()}".` : filter === "sem_os" ? `Tudo em dia: nenhuma falha sem OS nos últimos ${FAILURE_WINDOW_DAYS} dias.` : "Nenhum checklist com falha neste filtro."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {visible.map((c) => {
            const os = linked[c.id];
            return (
              <Card key={c.id} className={cn("flex flex-col gap-3 border-l-4 p-4", os ? "border-l-blue-500" : "border-l-destructive")}>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{c.vehicle?.plate ?? "—"}</span>
                    {c.vehicle?.model && <span className="truncate text-sm text-muted-foreground">· {c.vehicle.model}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground" title={new Date(c.created_at).toLocaleString("pt-BR")}>{timeAgo(c.created_at)}</span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">Motorista: {c.driver_name}{c.vehicle?.base ? ` · ${c.vehicle.base}` : ""}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.failures.length === 0 && <span className="text-xs italic text-muted-foreground">Sem itens não conformes registrados.</span>}
                  {c.failures.map((f) => (
                    <button key={f.id} type="button" onClick={() => setSelected({ item: f.item_name, obs: f.observation ?? "", photo_url: f.photo_url })}
                      className="inline-flex max-w-full items-center gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-2 py-1 text-left text-xs transition-colors hover:bg-destructive/10">
                      {f.photo_url && <Camera className="size-3 shrink-0 text-destructive/70" />}
                      <span className="truncate font-medium text-destructive/90">{f.item_name}</span>
                      {f.observation && <span className="truncate text-muted-foreground">— {f.observation}</span>}
                    </button>
                  ))}
                </div>
                <div className="mt-auto">
                  {os ? (
                    <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
                      <Link to="/admin/maintenance/$id" params={{ id: os.id }}><Wrench />{os.order_number}<StatusBadge status={os.status} kind={os.order_type} /></Link>
                    </Button>
                  ) : (
                    <Button asChild size="sm" className="w-full sm:w-auto">
                      <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never}><FilePlus />Abrir OS desta falha</Link>
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {selected && <FailurePhotoModal failure={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
