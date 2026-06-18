import {  LogOut, Clock, AlertCircle, X as Camera, Trash2, ClipboardList, FilePlus } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, FileSpreadsheet, FileDown, AlertTriangle, CheckCircle2, Wrench, Search, XIcon } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/checklists")({ component: HistoryPage });

type Row = {
  id: string; created_at: string; has_issues: boolean; itinerary: string | null; status: string;
  driver_id: string;
  vehicles: { plate: string; model: string | null; vehicle_type: string; base: string | null } | null;
  profiles?: { full_name: string | null; cpf: string | null } | null;
  photo_count?: number;
  photo_urls?: string[];
};

type FilterState = { from: string; to: string; plate: string; driver: string; base: string; type: string; issues: string };

// Isolamos os filtros em uma função pura para não estourar a Complexidade Ciclomática (Max 10) no componente
function passesFilter(c: Row, f: FilterState): boolean {
  if (f.from && new Date(c.created_at) < new Date(f.from)) return false;
  if (f.to) { const t = new Date(f.to); t.setDate(t.getDate() + 1); if (new Date(c.created_at) >= t) return false; }
  if (f.plate && !(c.vehicles?.plate ?? "").toLowerCase().includes(f.plate.toLowerCase())) return false;
  if (f.driver && !(c.profiles?.full_name ?? "").toLowerCase().includes(f.driver.toLowerCase())) return false;
  if (f.base && !(c.vehicles?.base ?? "").toLowerCase().includes(f.base.toLowerCase())) return false;
  if (f.type && c.vehicles?.vehicle_type !== f.type) return false;
  if (f.issues === "yes" && !c.has_issues) return false;
  if (f.issues === "no" && c.has_issues) return false;
  return true;
}

function HistoryPage() {
  const { isAdmin, isMaster } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [osMap, setOsMap] = useState<Record<string, { order_number: string; id: string }>>({});

  const [f, setF] = useState<FilterState>({ from: "", to: "", plate: "", driver: "", base: "", type: "", issues: "all" });
  const [showFilter, setShowFilter] = useState(false);

  const activeFilterCount = [f.from, f.to, f.plate, f.driver, f.base, f.type, f.issues !== "all" ? f.issues : ""].filter(Boolean).length;

  useEffect(() => { (async () => {
    setLoading(true);
    const { data } = await supabase.from("checklists")
      .select("id, driver_id, created_at, has_issues, itinerary, status, vehicles(plate, model, vehicle_type, base)")
      .order("created_at", { ascending: false }).limit(5000);
    const list = (data ?? []) as unknown as Row[];
    const ids = Array.from(new Set(list.map((c) => c.driver_id).filter(Boolean)));
    let map: Record<string, { full_name: string | null; cpf: string | null }> = {};
    if (ids.length) {
      const { data: p } = await supabase.from("profiles").select("id, full_name, cpf").in("id", ids);
      map = Object.fromEntries((p ?? []).map((x) => [x.id, { full_name: x.full_name, cpf: x.cpf }]));
    }
    
    const checklistIds = list.map((c) => c.id);
    const photosByChecklist: Record<string, string[]> = {};
    if (checklistIds.length) {
      const { data: resps } = await supabase.from("checklist_responses").select("checklist_id, photo_url").in("checklist_id", checklistIds).not("photo_url", "is", null);
      for (const r of (resps ?? []) as Array<{ checklist_id: string; photo_url: string | null }>) {
        if (!r.photo_url) continue;
        (photosByChecklist[r.checklist_id] ||= []).push(r.photo_url);
      }
    }
    setRows(list.map((r) => ({ ...r, profiles: map[r.driver_id] ?? null, photo_urls: photosByChecklist[r.id] ?? [], photo_count: (photosByChecklist[r.id] ?? []).length })));

    if (checklistIds.length) {
      const { data: osData } = await supabase.from("maintenance_orders").select("id, order_number, checklist_id").in("checklist_id", checklistIds).is("deleted_at", null);
      const newOsMap: Record<string, { order_number: string; id: string }> = {};
      for (const os of (osData ?? []) as Array<{ id: string; order_number: string; checklist_id: string }>) {
        if (os.checklist_id) newOsMap[os.checklist_id] = { id: os.id, order_number: os.order_number };
      }
      setOsMap(newOsMap);
    }
    setLoading(false);
  })(); }, []);

  const filtered = rows.filter((c) => passesFilter(c, f));

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

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Histórico Geral de Checklists</h1>
          <p className="text-sm text-muted-foreground">Pesquise todo o histórico desde o primeiro checklist</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={showFilter ? "secondary" : "outline"}
            onClick={() => setShowFilter((v) => !v)}
            className="relative gap-1.5"
          >
            <SlidersHorizontal className="size-4" />
            Filtros
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={!filtered.length}><FileSpreadsheet className="size-4 mr-2" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!filtered.length}><FileDown className="size-4 mr-2" />PDF</Button>
        </div>
      </div>

      {showFilter && (
        <Card className="p-4 space-y-3 border-dashed border-primary/30 bg-primary/[0.02]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><Label className="text-xs">De</Label><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
            <div><Label className="text-xs">Placa</Label><Input value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} /></div>
            <div><Label className="text-xs">Motorista</Label><Input value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })} /></div>
            <div><Label className="text-xs">Base</Label><Input value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })} /></div>
            <div><Label className="text-xs">Categoria</Label>
              <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="">Todas</option><option value="PESADOS">Pesados</option><option value="OPERACIONAIS">Operacionais</option>
                <option value="CESTO_AEREO">Cesto Aéreo</option><option value="ADMINISTRATIVO">Administrativo</option><option value="MUNCK">Munck</option>
              </select>
            </div>
            <div><Label className="text-xs">Status</Label>
              <select value={f.issues} onChange={(e) => setF({ ...f, issues: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="all">Todos</option><option value="yes">Com falhas</option><option value="no">OK</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="ghost" className="w-full" onClick={() => setF({ from: "", to: "", plate: "", driver: "", base: "", type: "", issues: "all" })}>
                Limpar
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{filtered.length} checklist(s)</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground">Nenhum resultado.</div>}
        <div className="divide-y divide-border max-h-[60vh] overflow-auto">
          {filtered.map((c) => (
            <div key={c.id} className="py-3 flex items-center gap-2 text-sm hover:bg-muted/30 px-2 rounded-md">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{c.vehicles?.plate ?? "—"} <span className="text-xs font-normal text-muted-foreground">• {c.profiles?.full_name ?? "—"}</span></div>
                <div className="text-xs text-muted-foreground truncate">{new Date(c.created_at).toLocaleString("pt-BR")}{c.itinerary ? ` • ${c.itinerary}` : ""}{c.vehicles?.base ? ` • ${c.vehicles.base}` : ""}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {c.has_issues && (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDetailId(c.id)}>
                    <Search className="size-4 mr-1" />Ver Falhas
                  </Button>
                )}
                {c.has_issues && (isAdmin || isMaster) && (
                  osMap[c.id]
                    ? <Link to="/admin/maintenance/$id" params={{ id: osMap[c.id].id }} className="text-xs flex items-center gap-1 text-primary hover:underline font-semibold">
                        <Wrench className="size-3" />OS N°{osMap[c.id].order_number}
                      </Link>
                    : <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never} className="text-xs flex items-center gap-1 text-amber-600 hover:underline">
                        <Wrench className="size-3" />Abrir OS
                      </Link>
                )}
                {(c.photo_count ?? 0) > 0 && <span className="text-xs text-muted-foreground">{c.photo_count} foto(s)</span>}
                {c.has_issues 
                  ? <span className="text-destructive flex items-center gap-1 text-xs"><AlertTriangle className="size-3" />Falhas</span>
                  : <span className="text-green-600 flex items-center gap-1 text-xs"><CheckCircle2 className="size-3" />OK</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {detailId && <DetailModal id={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// Modal Limpo isolado para detalhar as falhas do Checklist específico
function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [failures, setFailures] = useState<Array<{ id: string; item: string; obs: string; url: string | null }>>([]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("checklist_responses")
        .select("id, observation, photo_url, checklist_items(name)")
        .eq("checklist_id", id).eq("status", "NAO_OK");

      const list = (data ?? []).map((r: any) => ({
        id: r.id, item: r.checklist_items?.name ?? "Item", obs: r.observation ?? "", photo_url: r.photo_url
      }));

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
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="font-bold text-lg flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" />Falhas Registradas</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        {loading && <div className="text-sm text-muted-foreground p-4 text-center">Carregando detalhes...</div>}
        {!loading && failures.length === 0 && <div className="text-sm text-muted-foreground p-4 text-center">Nenhuma falha encontrada neste checklist.</div>}
        <div className="space-y-3 pt-2">
          {failures.map(f => (
            <div key={f.id} className="bg-destructive/5 p-3 rounded-md border border-destructive/20">
              <div className="font-bold text-sm text-destructive">{f.item}</div>
              {f.obs && <div className="text-sm text-muted-foreground mt-1">Obs: {f.obs}</div>}
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="block mt-2">
                  <img src={f.url} alt="Foto da falha" className="h-32 w-auto object-cover rounded border border-border" />
                </a>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}