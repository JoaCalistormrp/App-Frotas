import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Camera, CheckCircle2, ChevronDown, ClipboardList, FileDown, FilePlus, FileSpreadsheet, Search,
  SlidersHorizontal, Wrench, X as XIcon,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding, urlToDataUrl } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";
import { canAccessPage, prettyName } from "@/lib/nav";
import { timeAgo, type MaintenanceStatus } from "@/lib/maintenance";
import { StatusBadge } from "@/components/maintenance-ui";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/checklists")({ component: HistoryPage });

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  PESADOS: "Pesados",
  OPERACIONAIS: "Operacionais",
  CESTO_AEREO: "Cesto Aéreo",
  ADMINISTRATIVO: "Administrativo",
  MUNCK: "Munck",
  MAQUINARIO: "Maquinário",
};

const VEHICLE_TYPE_BADGE: Record<string, string> = {
  PESADOS: "bg-slate-500/15 text-slate-700 dark:text-slate-400",
  OPERACIONAIS: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  CESTO_AEREO: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  ADMINISTRATIVO: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
  MUNCK: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  MAQUINARIO: "bg-teal-500/15 text-teal-700 dark:text-teal-400",
};

type Row = {
  id: string; created_at: string; has_issues: boolean; itinerary: string | null; status: string;
  driver_id: string;
  vehicles: { plate: string; model: string | null; vehicle_type: string; base: string | null } | null;
  profiles?: { full_name: string | null; cpf: string | null } | null;
  photo_count?: number;
  photo_urls?: string[];
  failure_count?: number;
};

type LinkedOs = { id: string; order_number: string; status: MaintenanceStatus };
type Period = "hoje" | "7d" | "30d" | "tudo";
type IssueFilter = "todos" | "falhas" | "ok";
type Extra = { from: string; to: string; base: string; type: string };

const PERIODS: Array<[Period, string]> = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["tudo", "Tudo"]];
const EMPTY_EXTRA: Extra = { from: "", to: "", base: "", type: "" };
const PAGE = 40;

const startOfDayOffset = (days: number) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - days); return d; };
const periodStart = (p: Period) => (p === "hoje" ? startOfDayOffset(0) : p === "7d" ? startOfDayOffset(6) : p === "30d" ? startOfDayOffset(29) : null);

function inPeriod(c: Row, p: Period, x: Extra) {
  const t = new Date(c.created_at);
  const s = periodStart(p);
  if (s && t < s) return false;
  if (x.from && t < new Date(`${x.from}T00:00:00`)) return false;
  if (x.to) { const end = new Date(`${x.to}T00:00:00`); end.setDate(end.getDate() + 1); if (t >= end) return false; }
  if (x.base && c.vehicles?.base !== x.base) return false;
  if (x.type && c.vehicles?.vehicle_type !== x.type) return false;
  return true;
}

function matchesSearch(c: Row, q: string) {
  return [c.vehicles?.plate, c.vehicles?.model, c.profiles?.full_name, c.vehicles?.base, c.itinerary]
    .some((v) => (v ?? "").toLowerCase().includes(q));
}

// PostgREST recebe os ids na URL; em lotes evitamos URLs gigantes conforme o histórico cresce
async function inChunks<T>(ids: string[], fetch: (chunk: string[]) => PromiseLike<{ data: T[] | null }>) {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await fetch(ids.slice(i, i + 150));
    out.push(...(data ?? []));
  }
  return out;
}

function HistoryPage() {
  const { modules } = useAuth();
  const canMaintain = canAccessPage(modules, "frotas.manutencao");
  const canNewChecklist = canAccessPage(modules, "frotas.checklist_new");
  const deepLink = useSearch({ strict: false }) as { periodo?: string; status?: string };

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [osMap, setOsMap] = useState<Record<string, LinkedOs>>({});
  const [reportingId, setReportingId] = useState<string | null>(null);

  const [period, setPeriod] = useState<Period>(() => (PERIODS.some(([p]) => p === deepLink.periodo) ? (deepLink.periodo as Period) : "30d"));
  const [issues, setIssues] = useState<IssueFilter>(() => (deepLink.status === "falhas" || deepLink.status === "ok" ? deepLink.status : "todos"));
  const [search, setSearch] = useState("");
  const [extra, setExtra] = useState<Extra>(EMPTY_EXTRA);
  const [showMore, setShowMore] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE);

  useEffect(() => { (async () => {
    setLoading(true);
    const { data } = await supabase.from("checklists")
      .select("id, driver_id, created_at, has_issues, itinerary, status, vehicles(plate, model, vehicle_type, base)")
      .order("created_at", { ascending: false }).limit(5000);
    const list = (data ?? []) as unknown as Row[];
    const driverIds = Array.from(new Set(list.map((c) => c.driver_id).filter(Boolean)));
    const checklistIds = list.map((c) => c.id);

    const [profiles, resps, osData] = await Promise.all([
      inChunks<{ id: string; full_name: string | null; cpf: string | null }>(driverIds, (ch) => supabase.from("profiles").select("id, full_name, cpf").in("id", ch)),
      inChunks<{ checklist_id: string; photo_url: string | null; status: string }>(checklistIds, (ch) =>
        supabase.from("checklist_responses").select("checklist_id, photo_url, status").in("checklist_id", ch).or("status.eq.NAO_OK,photo_url.not.is.null")),
      inChunks<{ id: string; order_number: string; checklist_id: string | null; status: MaintenanceStatus }>(checklistIds.filter((_, i) => list[i].has_issues), (ch) =>
        supabase.from("maintenance_orders").select("id, order_number, checklist_id, status").in("checklist_id", ch).is("deleted_at", null) as never),
    ]);

    const map = Object.fromEntries(profiles.map((x) => [x.id, { full_name: x.full_name, cpf: x.cpf }]));
    const photos: Record<string, string[]> = {};
    const fails: Record<string, number> = {};
    for (const r of resps) {
      if (r.photo_url) (photos[r.checklist_id] ||= []).push(r.photo_url);
      if (r.status === "NAO_OK") fails[r.checklist_id] = (fails[r.checklist_id] ?? 0) + 1;
    }
    setRows(list.map((r) => ({
      ...r, profiles: map[r.driver_id] ?? null, photo_urls: photos[r.id] ?? [], photo_count: (photos[r.id] ?? []).length, failure_count: fails[r.id] ?? 0,
    })));
    const os: Record<string, LinkedOs> = {};
    for (const o of osData) if (o.checklist_id) os[o.checklist_id] = { id: o.id, order_number: o.order_number, status: o.status };
    setOsMap(os);
    setLoading(false);
  })(); }, []);

  useEffect(() => { setVisibleCount(PAGE); }, [period, issues, search, extra]);

  const q = search.trim().toLowerCase();
  const scoped = rows.filter((c) => inPeriod(c, period, extra) && (!q || matchesSearch(c, q)));
  const counts = { todos: scoped.length, falhas: scoped.filter((c) => c.has_issues).length, ok: scoped.filter((c) => !c.has_issues).length };
  const filtered = scoped.filter((c) => issues === "todos" || (issues === "falhas" ? c.has_issues : !c.has_issues));
  const withoutOs = scoped.filter((c) => c.has_issues && !osMap[c.id]).length;
  const bases = Array.from(new Set(rows.map((c) => c.vehicles?.base).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const extraCount = Object.values(extra).filter(Boolean).length;
  const anyFilter = period !== "30d" || issues !== "todos" || !!q || extraCount > 0;
  const clearAll = (p: Period = "30d") => { setPeriod(p); setIssues("todos"); setSearch(""); setExtra(EMPTY_EXTRA); };

  const activeChips: Array<{ key: keyof Extra; label: string }> = [
    extra.from && { key: "from" as const, label: `De ${new Date(`${extra.from}T00:00:00`).toLocaleDateString("pt-BR")}` },
    extra.to && { key: "to" as const, label: `Até ${new Date(`${extra.to}T00:00:00`).toLocaleDateString("pt-BR")}` },
    extra.base && { key: "base" as const, label: extra.base },
    extra.type && { key: "type" as const, label: VEHICLE_TYPE_LABELS[extra.type] ?? extra.type },
  ].filter(Boolean) as Array<{ key: keyof Extra; label: string }>;

  const data = () => filtered.map((c) => ({
    Data: new Date(c.created_at).toLocaleString("pt-BR"), Placa: c.vehicles?.plate ?? "", Modelo: c.vehicles?.model ?? "",
    Tipo: c.vehicles?.vehicle_type ?? "", Base: c.vehicles?.base ?? "",
    Motorista: c.profiles?.full_name ?? "", CPF: c.profiles?.cpf ?? "",
    Itinerário: c.itinerary ?? "", Status: c.has_issues ? "Com falhas" : "OK",
    Fotos: c.photo_count ?? 0, "URLs Fotos": (c.photo_urls ?? []).join(" | "),
  }));

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data()); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklists");
    XLSX.writeFile(wb, `historico_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    await applyPdfBranding(doc, "Histórico Geral de Checklists", `Total filtrado: ${filtered.length}`);
    const d = data();
    autoTable(doc, { startY: 32, head: [Object.keys(d[0] ?? { Data: "" })], body: d.map((r) => Object.values(r).map((v) => String(v))), styles: { fontSize: 7 }, headStyles: { fillColor: [30, 40, 80] } });
    doc.save(`historico_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // Relatório completo de UM checklist: todos os itens respondidos (Conforme/Não Conforme/N/A) + fotos anexadas
  const exportChecklistReport = async (row: Row) => {
    setReportingId(row.id);
    try {
      const [{ data: ck }, { data: resp }] = await Promise.all([
        supabase.from("checklists").select("itinerary, odometer_start").eq("id", row.id).maybeSingle(),
        (supabase as any)
          .from("checklist_responses")
          .select("status, observation, photo_url, checklist_items(name, checklist_categories(name))")
          .eq("checklist_id", row.id),
      ]);
      const responses = (resp ?? []) as Array<{
        status: string; observation: string | null; photo_url: string | null;
        checklist_items: { name: string; checklist_categories: { name: string } | null } | null;
      }>;

      const paths = responses.map((r) => r.photo_url).filter(Boolean) as string[];
      const photoUrls: Record<string, string> = {};
      if (paths.length) {
        await Promise.all(paths.map(async (p) => {
          const { data: s } = await supabase.storage.from("checklist-photos").createSignedUrl(p, 3600);
          if (s?.signedUrl) photoUrls[p] = s.signedUrl;
        }));
      }

      const statusLabel = (s: string) => s === "OK" ? "Conforme" : s === "NAO_OK" ? "Não conforme" : "N/A";
      const typeLabel = VEHICLE_TYPE_LABELS[row.vehicles?.vehicle_type ?? ""] ?? row.vehicles?.vehicle_type ?? "—";

      const doc = new jsPDF();
      await applyPdfBranding(doc, `Checklist • ${row.vehicles?.plate ?? "—"}`, `${typeLabel} • ${new Date(row.created_at).toLocaleString("pt-BR")}`);
      doc.setFontSize(10);
      const info = [
        `Placa: ${row.vehicles?.plate ?? "—"} (${row.vehicles?.model ?? "—"})`,
        `Tipo: ${typeLabel}`,
        `Motorista: ${row.profiles?.full_name ?? "—"}`,
        `Data: ${new Date(row.created_at).toLocaleString("pt-BR")}`,
        `Base: ${row.vehicles?.base ?? "—"}`,
        `Itinerário: ${ck?.itinerary ?? row.itinerary ?? "—"}`,
        `Odômetro: ${ck?.odometer_start ?? "—"}`,
        `Status: ${row.has_issues ? "Com falhas" : "OK"}`,
      ];
      info.forEach((t, i) => doc.text(t, 14, 36 + i * 6));
      autoTable(doc, {
        startY: 36 + info.length * 6 + 4,
        head: [["Categoria", "Item", "Status", "Observação"]],
        body: responses.map((r) => [
          r.checklist_items?.checklist_categories?.name ?? "",
          r.checklist_items?.name ?? "",
          statusLabel(r.status),
          r.observation ?? "",
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 40, 80] },
      });

      const photoResps = responses.filter((r) => r.photo_url);
      if (photoResps.length) {
        doc.addPage();
        await applyPdfBranding(doc, "Evidências fotográficas", `Checklist ${row.vehicles?.plate ?? "—"}`);
        let y = 36;
        const pageH = doc.internal.pageSize.getHeight();
        for (const r of photoResps) {
          const url = photoUrls[r.photo_url as string];
          if (!url) continue;
          try {
            const dataUrl = await urlToDataUrl(url);
            const label = `${r.checklist_items?.name ?? ""} — ${r.observation ?? ""}`;
            if (y > pageH - 90) { doc.addPage(); await applyPdfBranding(doc, "Evidências fotográficas", `Checklist ${row.vehicles?.plate ?? "—"}`); y = 36; }
            doc.setFontSize(9); doc.text(label.slice(0, 100), 14, y);
            doc.addImage(dataUrl, "JPEG", 14, y + 3, 80, 60, undefined, "FAST");
            y += 72;
          } catch { /* pula foto corrompida */ }
        }
      }
      doc.save(`checklist_${row.vehicles?.plate ?? row.id}_${new Date(row.created_at).toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReportingId(null);
    }
  };

  const visible = filtered.slice(0, visibleCount);

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="size-6" />Histórico de checklists</h1>
          <p className="text-sm text-muted-foreground">Todos os checklists enviados, do mais recente ao mais antigo</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={exportExcel} disabled={!filtered.length}><FileSpreadsheet />Excel</Button>
          <Button size="sm" variant="ghost" onClick={exportPdf} disabled={!filtered.length}><FileDown />PDF</Button>
          {canNewChecklist && (
            <Button asChild size="sm"><Link to="/admin/checklist"><FilePlus />Abrir checklist</Link></Button>
          )}
        </div>
      </div>

      {!loading && withoutOs > 0 && canMaintain && (
        <Card className="flex items-center gap-3 border-destructive/30 bg-destructive/5 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"><AlertTriangle className="size-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-tight">{withoutOs} checklist{withoutOs > 1 ? "s" : ""} com falha sem OS neste período</div>
            <div className="truncate text-xs text-muted-foreground">Abra a OS direto no cartão do checklist ou pela Manutenção</div>
          </div>
          <Button size="sm" variant="outline" className="shrink-0 bg-background" onClick={() => setIssues("falhas")}>Ver falhas</Button>
        </Card>
      )}

      {/* Filtros: período primeiro, depois busca e situação; o resto fica recolhido */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Segmented value={period} onChange={setPeriod} options={PERIODS} label="Período" />
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar placa, motorista, base…" className="pl-9 pr-9" aria-label="Buscar checklists" />
            {search && (
              <button type="button" aria-label="Limpar busca" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          <Button variant={showMore || extraCount ? "secondary" : "outline"} onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="shrink-0">
            <SlidersHorizontal />Mais filtros{extraCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">{extraCount}</span>}
            <ChevronDown className={cn("transition-transform", showMore && "rotate-180")} />
          </Button>
        </div>

        {showMore && (
          <Card className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
            <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={extra.from} onChange={(e) => setExtra({ ...extra, from: e.target.value })} /></div>
            <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={extra.to} onChange={(e) => setExtra({ ...extra, to: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="text-xs">Base</Label>
              <select value={extra.base} onChange={(e) => setExtra({ ...extra, base: e.target.value })} className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm">
                <option value="">Todas</option>
                {bases.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <select value={extra.type} onChange={(e) => setExtra({ ...extra, type: e.target.value })} className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm">
                <option value="">Todas</option>
                {Object.entries(VEHICLE_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]" role="group" aria-label="Filtrar por situação">
            {([["todos", "Todos"], ["falhas", "Com falha"], ["ok", "Sem falha"]] as Array<[IssueFilter, string]>).map(([k, l]) => {
              const on = issues === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setIssues(k)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                  )}
                >
                  {k === "falhas" && <AlertTriangle className="size-3.5" />}
                  {k === "ok" && <CheckCircle2 className="size-3.5" />}
                  {l}
                  <span className={cn("min-w-5 rounded-full px-1.5 text-[10px] font-bold", on ? "bg-white/20" : "bg-muted text-muted-foreground")}>{counts[k]}</span>
                </button>
              );
            })}
          </div>
          {activeChips.map((c) => (
            <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-secondary pl-2.5 pr-1 text-xs">
              {c.label}
              <button type="button" aria-label={`Remover filtro ${c.label}`} onClick={() => setExtra({ ...extra, [c.key]: "" })} className="rounded-full p-0.5 hover:bg-background">
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
          {anyFilter && <button type="button" onClick={() => clearAll()} className="text-xs font-medium text-primary hover:underline">Limpar filtros</button>}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="space-y-3 p-8 text-center">
          <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted"><ClipboardList className="size-5 text-muted-foreground" /></div>
          <p className="text-sm text-muted-foreground">
            {rows.length === 0 ? "Nenhum checklist enviado ainda." : "Nenhum checklist encontrado com esses filtros."}
          </p>
          {rows.length > 0 && <Button size="sm" variant="outline" onClick={() => clearAll("tudo")}>Limpar filtros e ver tudo</Button>}
        </Card>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Mostrando {visible.length} de {filtered.length} checklist{filtered.length > 1 ? "s" : ""}
          </p>
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {visible.map((c) => (
              <ChecklistCard
                key={c.id}
                row={c}
                os={osMap[c.id]}
                canMaintain={canMaintain}
                reporting={reportingId === c.id}
                onFailures={() => setDetailId(c.id)}
                onReport={() => exportChecklistReport(c)}
              />
            ))}
          </div>
          {visible.length < filtered.length && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" onClick={() => setVisibleCount((n) => n + PAGE)}>
                Mostrar mais {Math.min(PAGE, filtered.length - visible.length)}
              </Button>
            </div>
          )}
        </>
      )}

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string }) {
  return (
    <div role="group" aria-label={label} className="grid shrink-0 grid-flow-col auto-cols-fr rounded-md border border-border bg-muted/50 p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn("h-8 rounded px-3 text-xs font-medium transition-colors", value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function ChecklistCard({ row: c, os, canMaintain, reporting, onFailures, onReport }: {
  row: Row; os?: LinkedOs; canMaintain: boolean; reporting: boolean; onFailures: () => void; onReport: () => void;
}) {
  const type = c.vehicles?.vehicle_type;
  const meta = [prettyName(c.profiles?.full_name) ?? "—", c.vehicles?.base, c.itinerary].filter(Boolean).join(" · ");
  return (
    <Card className={cn("flex h-full flex-col gap-3 border-l-4 p-4", c.has_issues ? "border-l-destructive" : "border-l-green-500")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{c.vehicles?.plate ?? "—"}</span>
            {c.vehicles?.model && <span className="truncate text-sm text-muted-foreground">· {c.vehicles.model}</span>}
            {type && (
              <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold", VEHICLE_TYPE_BADGE[type] ?? "bg-muted text-muted-foreground")}>
                {VEHICLE_TYPE_LABELS[type] ?? type}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">{meta}</p>
        </div>
        <div className="shrink-0 text-right">
          {c.has_issues
            ? <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="size-3.5" />{c.failure_count ? `${c.failure_count} falha${c.failure_count > 1 ? "s" : ""}` : "Com falha"}</span>
            : <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400"><CheckCircle2 className="size-3.5" />Sem falha</span>}
          <div className="text-[11px] text-muted-foreground" title={new Date(c.created_at).toLocaleString("pt-BR")}>
            {timeAgo(c.created_at)} · {new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {c.has_issues && (
          <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onFailures}>
            <Search />Ver falhas
          </Button>
        )}
        {c.has_issues && canMaintain && (
          os ? (
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/maintenance/$id" params={{ id: os.id }}><Wrench />{os.order_number}<StatusBadge status={os.status} /></Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never}><FilePlus />Abrir OS</Link>
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" disabled={reporting} onClick={onReport}>
          <FileDown />{reporting ? "Gerando…" : "Relatório"}
        </Button>
        {(c.photo_count ?? 0) > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground"><Camera className="size-3.5" />{c.photo_count}</span>
        )}
      </div>
    </Card>
  );
}

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<Array<{ id: string; item: string; obs: string; url: string | null; status: string }>>([]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("checklist_responses")
        .select("id, observation, photo_url, status, checklist_items(name)")
        .eq("checklist_id", id)
        .or("status.eq.NAO_OK,photo_url.not.is.null,observation.not.is.null");

      const list = (data ?? []).map((r: any) => ({
        id: r.id, item: r.checklist_items?.name ?? "Item", obs: r.observation ?? "", photo_url: r.photo_url, status: r.status,
      }));
      list.sort((a, b) => Number(b.status === "NAO_OK") - Number(a.status === "NAO_OK"));

      const withUrls = await Promise.all(list.map(async (f) => {
        if (!f.photo_url) return { ...f, url: null };
        const { data: s } = await supabase.storage.from("checklist-photos").createSignedUrl(f.photo_url, 3600);
        return { ...f, url: s?.signedUrl ?? null };
      }));

      if (isMounted) { setFailures(withUrls); setLoading(false); }
    })();
    return () => { isMounted = false; };
  }, [id]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <Card role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-lg space-y-3 overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-destructive"><AlertTriangle className="size-5" />Falhas registradas</h3>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><XIcon className="size-4" /></Button>
        </div>
        {loading && <div className="p-4 text-center text-sm text-muted-foreground">Carregando detalhes…</div>}
        {!loading && failures.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">Nenhuma falha encontrada neste checklist.</div>}
        <div className="space-y-3 pt-2">
          {failures.map((f) => (
            <div key={f.id} className={cn("rounded-md border p-3", f.status === "NAO_OK" ? "border-destructive/20 bg-destructive/5" : "border-border bg-muted/30")}>
              <div className={cn("text-sm font-bold", f.status === "NAO_OK" && "text-destructive")}>{f.item}</div>
              {f.obs && <div className="mt-1 text-sm text-muted-foreground">Obs: {f.obs}</div>}
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="mt-2 block">
                  <img src={f.url} alt={`Foto: ${f.item}`} className="h-32 w-auto rounded border border-border object-cover" />
                </a>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
