import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ERPSidebar } from "@/components/erp-sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { queryOracleFinancial } from "@/lib/oracle.server";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  TrendingDown, Search, CheckCircle2, Link2, FileText, Truck,
  Calendar, Wrench, DollarSign, AlertCircle, Loader2, X, Plus, Flag,
  SlidersHorizontal, Unlink2,
} from "lucide-react";
import { statusLabel, statusTone } from "@/lib/maintenance";

export const Route = createFileRoute("/financeiro")({ component: FinanceiroFrotas });

const APPROVED_STATUSES = [
  "aprovada", "aguardando_pecas", "em_execucao",
  "em_manutencao", "teste_final", "finalizada", "solucionado",
];

// ── Types ──────────────────────────────────────────────────────────────────────
type PartialLink = {
  id: string; documento: string; ap: string;
  projeto: string | null; extenso_pro: string | null; valor: number | null;
};

type PendingOrder = {
  id: string; order_number: string; order_type: string;
  status: string; data_entrada: string | null; data_saida: string | null;
  items_replaced: string | null; approved_at: string | null;
  vehicles: { plate: string | null; model: string | null } | null;
  links: PartialLink[];
};

type OracleRow = { projeto: string; extenso_pro: string; valor: number | null };

type FinalizedOrder = {
  id: string; maintenance_order_id: string; finalized_at: string;
  order: {
    order_number: string; order_type: string; status: string;
    data_entrada: string | null; data_saida: string | null;
    items_replaced: string | null;
    vehicles: { plate: string | null; model: string | null } | null;
  } | null;
  links: PartialLink[];
};

type Filters = { os: string; documento: string; projeto: string; extenso_pro: string };
const EMPTY_FILTERS: Filters = { os: "", documento: "", projeto: "", extenso_pro: "" };

// ── Helpers ────────────────────────────────────────────────────────────────────
const brl = (v: number | null | undefined) =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

const sumLinks = (links: PartialLink[]) =>
  links.reduce((acc, l) => acc + (l.valor ?? 0), 0);

const activeCount = (f: Filters) =>
  Object.values(f).filter((v) => v.trim() !== "").length;

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase();

function matchesFilters(filters: Filters, orderNumber: string, links: PartialLink[]) {
  const { os, documento, projeto, extenso_pro } = filters;
  if (os && !norm(orderNumber).includes(norm(os))) return false;
  if (documento) {
    if (!links.some((l) => norm(l.documento).includes(norm(documento)))) return false;
  }
  if (projeto) {
    if (!links.some((l) => norm(l.projeto).includes(norm(projeto)))) return false;
  }
  if (extenso_pro) {
    if (!links.some((l) => norm(l.extenso_pro).includes(norm(extenso_pro)))) return false;
  }
  return true;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTone(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

// ── Filter panel ───────────────────────────────────────────────────────────────
function FilterPanel({
  filters, onChange, onClear,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  onClear: () => void;
}) {
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...filters, [key]: e.target.value });

  return (
    <Card className="p-3 border-dashed border-primary/30 bg-primary/[0.02]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Nº OS</Label>
          <Input
            placeholder="OS-0001"
            value={filters.os}
            onChange={set("os")}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Documento</Label>
          <Input
            placeholder="123456"
            value={filters.documento}
            onChange={set("documento")}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Cód. Projeto</Label>
          <Input
            placeholder="PRJ-001"
            value={filters.projeto}
            onChange={set("projeto")}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Projeto</Label>
          <Input
            placeholder="Nome do projeto"
            value={filters.extenso_pro}
            onChange={set("extenso_pro")}
            className="h-8 text-xs"
          />
        </div>
      </div>
      {activeCount(filters) > 0 && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <X className="size-3" /> Limpar filtros
          </button>
        </div>
      )}
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function FinanceiroFrotas() {
  const { user, isAdmin, isViewer, modules, loading } = useAuth();

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Carregando…</div>;
  if (!user) return <Navigate to="/" />;
  if (!isAdmin && !isViewer) return <Navigate to="/" />;
  if (!modules.includes("financeiro")) return <Navigate to="/home" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ERPSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-2 gap-2">
            <SidebarTrigger />
            <TrendingDown className="size-4 text-emerald-600" />
            <span className="text-sm font-semibold">Financeiro Frotas</span>
          </header>
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <FinanceiroContent />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// ── Content ────────────────────────────────────────────────────────────────────
function FinanceiroContent() {
  const { user } = useAuth();
  const oracleQuery = useServerFn(queryOracleFinancial);
  const [tab, setTab] = useState<"pendentes" | "vinculadas">("pendentes");

  const [pending, setPending]               = useState<PendingOrder[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [finalized, setFinalized]           = useState<FinalizedOrder[]>([]);
  const [loadingFinalized, setLoadingFinalized] = useState(true);

  // Filters
  const [showFilterP, setShowFilterP] = useState(false);
  const [filtersP, setFiltersP]       = useState<Filters>(EMPTY_FILTERS);
  const [showFilterV, setShowFilterV] = useState(false);
  const [filtersV, setFiltersV]       = useState<Filters>(EMPTY_FILTERS);

  // Dialog — adicionar documento
  const [dialogOrder, setDialogOrder]   = useState<PendingOrder | null>(null);
  const [docInput, setDocInput]         = useState("");
  const [apInput, setApInput]           = useState("");
  const [searching, setSearching]       = useState(false);
  const [oracleRows, setOracleRows]     = useState<OracleRow[] | undefined>(undefined);
  const [selectedRow, setSelectedRow]   = useState<OracleRow | null>(null);
  const [saving, setSaving]             = useState(false);

  // Detail sheet
  const [detailOrder, setDetailOrder]   = useState<FinalizedOrder | null>(null);

  // Desvincular OS confirmation
  const [unlinkOrder, setUnlinkOrder]   = useState<FinalizedOrder | null>(null);
  const [unlinking, setUnlinking]       = useState(false);

  // ── Filtered lists ─────────────────────────────────────────────────────────
  const filteredPending = useMemo(
    () => pending.filter((o) => matchesFilters(filtersP, o.order_number, o.links)),
    [pending, filtersP],
  );

  const filteredFinalized = useMemo(
    () => finalized.filter((f) =>
      matchesFilters(filtersV, f.order?.order_number ?? "", f.links)
    ),
    [finalized, filtersV],
  );

  // ── Carregar pendentes ──────────────────────────────────────────────────────
  const loadPending = async () => {
    setLoadingPending(true);

    const { data: finRaw } = await (supabase as any)
      .from("maintenance_os_link_finalized")
      .select("maintenance_order_id");
    const finalizedIds: string[] = (finRaw ?? []).map((r: any) => r.maintenance_order_id);

    let q = supabase
      .from("maintenance_orders")
      .select("id, order_number, order_type, status, data_entrada, data_saida, items_replaced, approved_at, vehicles(plate, model)")
      .in("status", APPROVED_STATUSES as any)
      .is("deleted_at", null)
      .order("approved_at", { ascending: false });

    if (finalizedIds.length) q = q.not("id", "in", `(${finalizedIds.join(",")})`);

    const { data: orders, error } = await q;
    if (error) { toast.error("Erro ao carregar OS: " + error.message); setLoadingPending(false); return; }

    const orderIds = (orders ?? []).map((o: any) => o.id);
    const linksMap: Record<string, PartialLink[]> = {};
    if (orderIds.length) {
      const { data: linksRaw } = await (supabase as any)
        .from("maintenance_financial_links")
        .select("id, maintenance_order_id, documento, ap, projeto, extenso_pro, valor")
        .in("maintenance_order_id", orderIds);
      for (const l of (linksRaw ?? []) as any[]) {
        (linksMap[l.maintenance_order_id] ||= []).push(l);
      }
    }

    setPending(((orders ?? []) as any[]).map((o) => ({ ...o, links: linksMap[o.id] ?? [] })));
    setLoadingPending(false);
  };

  // ── Carregar finalizadas ────────────────────────────────────────────────────
  const loadFinalized = async () => {
    setLoadingFinalized(true);

    const { data: finRaw, error } = await (supabase as any)
      .from("maintenance_os_link_finalized")
      .select(`id, maintenance_order_id, finalized_at,
               maintenance_orders!maintenance_order_id(order_number, order_type, status,
                 data_entrada, data_saida, items_replaced, vehicles(plate, model))`)
      .order("finalized_at", { ascending: false });

    if (error) { toast.error("Erro ao carregar vínculos: " + error.message); setLoadingFinalized(false); return; }

    const ids = ((finRaw ?? []) as any[]).map((r: any) => r.maintenance_order_id);
    const linksMap: Record<string, PartialLink[]> = {};
    if (ids.length) {
      const { data: linksRaw } = await (supabase as any)
        .from("maintenance_financial_links")
        .select("id, maintenance_order_id, documento, ap, projeto, extenso_pro, valor")
        .in("maintenance_order_id", ids);
      for (const l of (linksRaw ?? []) as any[]) {
        (linksMap[l.maintenance_order_id] ||= []).push(l);
      }
    }

    setFinalized(
      ((finRaw ?? []) as any[]).map((r: any) => ({
        id: r.id,
        maintenance_order_id: r.maintenance_order_id,
        finalized_at: r.finalized_at,
        order: r.maintenance_orders ?? null,
        links: linksMap[r.maintenance_order_id] ?? [],
      }))
    );
    setLoadingFinalized(false);
  };

  useEffect(() => { loadPending(); loadFinalized(); }, []);

  // ── Dialog helpers ──────────────────────────────────────────────────────────
  const openDialog = (o: PendingOrder) => {
    setDialogOrder(o);
    setDocInput(""); setApInput(""); setOracleRows(undefined); setSelectedRow(null);
  };
  const closeDialog = () => { setDialogOrder(null); setOracleRows(undefined); setSelectedRow(null); };

  const searchOracle = async () => {
    if (!docInput.trim() || !apInput.trim()) { toast.error("Preencha o Documento e o AP."); return; }
    setSearching(true); setOracleRows(undefined); setSelectedRow(null);
    try {
      const result = await oracleQuery({ data: { documento: docInput.trim(), ap: apInput.trim() } });
      setOracleRows(result?.rows ?? []);
    } catch (err: unknown) {
      toast.error("Erro na consulta ERP: " + (err instanceof Error ? err.message : String(err)));
      setOracleRows(undefined);
    } finally { setSearching(false); }
  };

  const addLink = async () => {
    if (!dialogOrder || !user || !selectedRow) return;
    setSaving(true);
    const { error } = await (supabase as any).from("maintenance_financial_links").insert({
      maintenance_order_id: dialogOrder.id,
      documento:   docInput.trim(),
      ap:          apInput.trim(),
      projeto:     selectedRow.projeto     || null,
      extenso_pro: selectedRow.extenso_pro || null,
      valor:       selectedRow.valor       ?? null,
      linked_by:   user.id,
    });
    setSaving(false);
    if (error) { toast.error("Erro ao guardar: " + error.message); return; }
    toast.success("Documento adicionado!");
    closeDialog();
    loadPending();
  };

  const finalizeOS = async (order: PendingOrder) => {
    if (!user) return;
    if (!order.links.length) { toast.error("Adicione pelo menos um documento antes de finalizar."); return; }

    const { error: finError } = await (supabase as any).from("maintenance_os_link_finalized").insert({
      maintenance_order_id: order.id,
      finalized_by: user.id,
    });
    if (finError) { toast.error("Erro ao finalizar: " + finError.message); return; }

    const { error: statusError } = await supabase
      .from("maintenance_orders")
      .update({ status: "finalizada" })
      .eq("id", order.id);
    if (statusError) toast.error("Vínculo registado, mas erro ao atualizar status: " + statusError.message);

    toast.success(`OS ${order.order_number} finalizada!`);
    loadPending(); loadFinalized();
  };

  const removeLink = async (linkId: string) => {
    const { error } = await (supabase as any).from("maintenance_financial_links").delete().eq("id", linkId);
    if (error) { toast.error("Erro ao remover: " + error.message); return; }
    loadPending();
  };

  const unlinkOS = async () => {
    if (!unlinkOrder) return;
    setUnlinking(true);
    const osId = unlinkOrder.maintenance_order_id;

    const { error: e1 } = await (supabase as any)
      .from("maintenance_financial_links").delete().eq("maintenance_order_id", osId);
    if (e1) { toast.error("Erro ao remover documentos: " + e1.message); setUnlinking(false); return; }

    const { error: e2 } = await (supabase as any)
      .from("maintenance_os_link_finalized").delete().eq("maintenance_order_id", osId);
    if (e2) { toast.error("Erro ao remover vínculo: " + e2.message); setUnlinking(false); return; }

    const { error: e3 } = await supabase
      .from("maintenance_orders")
      .update({ status: "aprovada" })
      .eq("id", osId);
    if (e3) toast.error("Vínculo removido, mas erro ao reverter status: " + e3.message);

    toast.success(`OS ${unlinkOrder.order?.order_number} desvinculada e revertida para Aprovada.`);
    setUnlinkOrder(null);
    setUnlinking(false);
    loadPending();
    loadFinalized();
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="pendentes" className="flex-1 sm:flex-none gap-1.5">
            <AlertCircle className="size-3.5" />
            OS Pendentes
            {pending.length > 0 && (
              <span className="ml-1 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="vinculadas" className="flex-1 sm:flex-none gap-1.5">
            <CheckCircle2 className="size-3.5" />
            OS Vinculadas
            {finalized.length > 0 && (
              <span className="ml-1 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                {finalized.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Pendentes ────────────────────────────────────────────────────── */}
        <TabsContent value="pendentes" className="space-y-3">
          {/* Barra de topo: descrição + botão filtro */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              OS aprovadas sem vínculo financeiro finalizado. Adicione os documentos e clique em{" "}
              <strong>Finalizar Vínculo</strong>.
            </p>
            <Button
              variant={showFilterP ? "secondary" : "outline"}
              size="sm"
              className="shrink-0 gap-1.5 relative"
              onClick={() => setShowFilterP((v) => !v)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filtros
              {activeCount(filtersP) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                  {activeCount(filtersP)}
                </span>
              )}
            </Button>
          </div>

          {showFilterP && (
            <FilterPanel
              filters={filtersP}
              onChange={setFiltersP}
              onClear={() => setFiltersP(EMPTY_FILTERS)}
            />
          )}

          {loadingPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          )}

          {!loadingPending && pending.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              <CheckCircle2 className="size-8 mx-auto mb-2 text-emerald-500/60" />
              Todas as OS aprovadas já estão vinculadas.
            </Card>
          )}

          {!loadingPending && pending.length > 0 && filteredPending.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              <Search className="size-7 mx-auto mb-2 opacity-30" />
              Nenhuma OS encontrada com os filtros aplicados.
              <button
                type="button"
                onClick={() => setFiltersP(EMPTY_FILTERS)}
                className="block mx-auto mt-2 text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </Card>
          )}

          {filteredPending.map((o) => (
            <Card key={o.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-primary">{o.order_number}</span>
                    <span className="text-xs text-muted-foreground font-mono">{o.order_type}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Truck className="size-3" />
                      {o.vehicles?.plate ?? "—"}{o.vehicles?.model ? ` · ${o.vehicles.model}` : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="size-3" />
                      Entrada: {fmtDate(o.data_entrada)}
                    </span>
                    {o.data_saida && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        Saída: {fmtDate(o.data_saida)}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => openDialog(o)} className="shrink-0 gap-1">
                  <Plus className="size-3.5" /> Adicionar Documento
                </Button>
              </div>

              {o.links.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    {o.links.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-xs">
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 min-w-0">
                          <span className="font-mono font-medium">Doc: {l.documento}</span>
                          <span className="font-mono text-muted-foreground">AP: {l.ap}</span>
                          {l.extenso_pro && <span className="text-muted-foreground truncate max-w-[160px]">{l.extenso_pro}</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-emerald-600">{brl(l.valor)}</span>
                          <button
                            type="button"
                            onClick={() => removeLink(l.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            title="Remover"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        {o.links.length} documento(s) · Total:{" "}
                        <span className="font-bold text-foreground">{brl(sumLinks(o.links))}</span>
                      </span>
                      <Button
                        size="sm"
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => finalizeOS(o)}
                      >
                        <Flag className="size-3.5" /> Finalizar Vínculo
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* ── Vinculadas ──────────────────────────────────────────────────── */}
        <TabsContent value="vinculadas" className="space-y-3">
          {/* Barra de topo */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              OS com vínculo financeiro concluído.
            </p>
            <Button
              variant={showFilterV ? "secondary" : "outline"}
              size="sm"
              className="shrink-0 gap-1.5 relative"
              onClick={() => setShowFilterV((v) => !v)}
            >
              <SlidersHorizontal className="size-3.5" />
              Filtros
              {activeCount(filtersV) > 0 && (
                <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                  {activeCount(filtersV)}
                </span>
              )}
            </Button>
          </div>

          {showFilterV && (
            <FilterPanel
              filters={filtersV}
              onChange={setFiltersV}
              onClear={() => setFiltersV(EMPTY_FILTERS)}
            />
          )}

          {loadingFinalized && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </div>
          )}

          {!loadingFinalized && finalized.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground text-sm">
              <FileText className="size-8 mx-auto mb-2 opacity-40" />
              Nenhuma OS finalizada ainda.
            </Card>
          )}

          {!loadingFinalized && finalized.length > 0 && filteredFinalized.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              <Search className="size-7 mx-auto mb-2 opacity-30" />
              Nenhuma OS encontrada com os filtros aplicados.
              <button
                type="button"
                onClick={() => setFiltersV(EMPTY_FILTERS)}
                className="block mx-auto mt-2 text-xs text-primary hover:underline"
              >
                Limpar filtros
              </button>
            </Card>
          )}

          {filteredFinalized.map((f) => (
            <Card
              key={f.id}
              className="p-4 cursor-pointer hover:bg-accent/30 hover:border-primary/30 transition-all"
              onClick={() => setDetailOrder(f)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-primary">{f.order?.order_number ?? "—"}</span>
                    <span className="text-xs text-muted-foreground font-mono">{f.order?.order_type}</span>
                    {f.order && <StatusBadge status={f.order.status} />}
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded-full font-medium">
                      {f.links.length} doc.
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Truck className="size-3" />
                      {f.order?.vehicles?.plate ?? "—"}
                    </span>
                    <span className="text-[10px]">Finalizado em {fmtDate(f.finalized_at)}</span>
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-2">
                  <div className="text-right">
                    <div className="text-sm font-bold text-emerald-600">{brl(sumLinks(f.links))}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">valor total</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-6 px-2 gap-1 border-orange-400/60 text-orange-600 hover:bg-orange-50 hover:text-orange-700 dark:hover:bg-orange-950/30"
                    onClick={(e) => { e.stopPropagation(); setUnlinkOrder(f); }}
                  >
                    <Unlink2 className="size-3" />
                    Desvincular
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Adicionar Documento ────────────────────────────────────── */}
      <Dialog open={!!dialogOrder} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="w-[95vw] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" />
              Adicionar Documento Financeiro
            </DialogTitle>
            {dialogOrder && (
              <DialogDescription>
                OS <span className="font-bold text-foreground">{dialogOrder.order_number}</span>
                {" · "}{dialogOrder.vehicles?.plate ?? "—"}
                {dialogOrder.links.length > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({dialogOrder.links.length} documento(s) já adicionado(s))
                  </span>
                )}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="doc-input">N° Documento</Label>
                <Input
                  id="doc-input"
                  placeholder="Ex: 123456"
                  value={docInput}
                  onChange={(e) => { setDocInput(e.target.value); setOracleRows(undefined); setSelectedRow(null); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-input">AP</Label>
                <Input
                  id="ap-input"
                  placeholder="Ex: AP001"
                  value={apInput}
                  onChange={(e) => { setApInput(e.target.value); setOracleRows(undefined); setSelectedRow(null); }}
                />
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={searching || !docInput.trim() || !apInput.trim()}
              onClick={searchOracle}
            >
              {searching
                ? <><Loader2 className="size-4 mr-2 animate-spin" />Consultando ERP Mega…</>
                : <><Search className="size-4 mr-2" />Buscar no ERP Mega</>
              }
            </Button>

            {oracleRows !== undefined && oracleRows.length === 0 && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 flex items-center gap-3">
                <X className="size-5 text-rose-600 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-rose-600">Documento não encontrado</div>
                  <div className="text-xs text-muted-foreground">Verifique o Documento e AP e tente novamente.</div>
                </div>
              </div>
            )}

            {oracleRows && oracleRows.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  Selecione o projeto / rateio:
                </div>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                  {oracleRows.map((row, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSelectedRow(row)}
                      className={`w-full text-left rounded-lg border px-3 py-2 flex items-center justify-between gap-3 transition-all text-sm ${
                        selectedRow === row
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-primary/40 hover:bg-accent/30"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {row.extenso_pro || <span className="italic text-muted-foreground">sem descrição</span>}
                        </div>
                        {row.projeto && (
                          <div className="text-[11px] font-mono text-muted-foreground truncate">{row.projeto}</div>
                        )}
                      </div>
                      <span className={`font-bold shrink-0 ${selectedRow === row ? "text-emerald-600" : ""}`}>
                        {brl(row.valor)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={closeDialog} disabled={saving}>Cancelar</Button>
            <Button disabled={!selectedRow || saving} onClick={addLink}>
              {saving
                ? <><Loader2 className="size-4 mr-2 animate-spin" />Guardando…</>
                : <><Plus className="size-4 mr-2" />Adicionar</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Sheet: Detalhe OS Finalizada ───────────────────────────────────── */}
      <Sheet open={!!detailOrder} onOpenChange={(open) => { if (!open) setDetailOrder(null); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {detailOrder && (() => {
            const o = detailOrder.order;
            return (
              <>
                <SheetHeader className="mb-4">
                  <SheetTitle className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    {o?.order_number ?? "OS"}
                  </SheetTitle>
                  <SheetDescription>Detalhe do vínculo financeiro</SheetDescription>
                </SheetHeader>

                <div className="space-y-5">
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                      <Truck className="size-3.5" /> Veículo
                    </h3>
                    <div className="text-sm space-y-1 pl-5">
                      <div><span className="text-muted-foreground">Placa:</span>{" "}<span className="font-mono font-bold">{o?.vehicles?.plate ?? "—"}</span></div>
                      <div><span className="text-muted-foreground">Modelo:</span>{" "}{o?.vehicles?.model ?? "—"}</div>
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                      <Calendar className="size-3.5" /> Datas
                    </h3>
                    <div className="text-sm space-y-1 pl-5">
                      <div><span className="text-muted-foreground">Entrada:</span>{" "}{fmtDate(o?.data_entrada ?? null)}</div>
                      <div><span className="text-muted-foreground">Saída:</span>{" "}{fmtDate(o?.data_saida ?? null)}</div>
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                      <Wrench className="size-3.5" /> Itens Substituídos
                    </h3>
                    <div className="text-sm pl-5 whitespace-pre-wrap leading-relaxed text-foreground/90">
                      {o?.items_replaced?.trim() || <span className="text-muted-foreground italic">—</span>}
                    </div>
                  </section>

                  <Separator />

                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-2 flex items-center gap-1.5">
                      <DollarSign className="size-3.5" /> Documentos Financeiros (ERP Mega)
                    </h3>
                    <div className="space-y-2 pl-5">
                      {detailOrder.links.map((l, i) => (
                        <div key={l.id} className="rounded-md bg-muted/40 px-3 py-2 text-sm space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-muted-foreground">#{i + 1}</span>
                            <span className="font-bold text-emerald-600">{brl(l.valor)}</span>
                          </div>
                          <div><span className="text-muted-foreground text-xs">Doc:</span>{" "}<span className="font-mono font-medium">{l.documento}</span></div>
                          <div><span className="text-muted-foreground text-xs">AP:</span>{" "}<span className="font-mono font-medium">{l.ap}</span></div>
                          {l.extenso_pro && <div className="text-xs text-muted-foreground">{l.extenso_pro}</div>}
                          {l.projeto && <div className="text-[11px] font-mono text-muted-foreground">{l.projeto}</div>}
                        </div>
                      ))}
                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">{detailOrder.links.length} documento(s)</span>
                        <span className="text-base font-bold text-emerald-600">{brl(sumLinks(detailOrder.links))}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ── Dialog: Confirmar Desvinculação ────────────────────────────────── */}
      <Dialog open={!!unlinkOrder} onOpenChange={(open) => { if (!open && !unlinking) setUnlinkOrder(null); }}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlink2 className="size-4 text-orange-500" />
              Desvincular OS do Financeiro
            </DialogTitle>
            <DialogDescription>
              {unlinkOrder && (
                <>
                  A OS <span className="font-bold text-foreground">{unlinkOrder.order?.order_number}</span>
                  {" "}será desvinculada do financeiro:{" "}
                  <strong>{unlinkOrder.links.length} documento(s)</strong> removido(s)
                  e o status revertido para <strong>Aprovada</strong>.
                  <br /><br />
                  Esta ação não pode ser desfeita.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button
              variant="outline"
              disabled={unlinking}
              onClick={() => setUnlinkOrder(null)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={unlinking}
              onClick={unlinkOS}
              className="w-full sm:w-auto gap-2"
            >
              {unlinking ? <Loader2 className="size-4 animate-spin" /> : <Unlink2 className="size-4" />}
              {unlinking ? "Desvinculando…" : "Confirmar Desvinculação"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
