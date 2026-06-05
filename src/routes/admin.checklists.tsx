import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Filter, FileSpreadsheet, FileDown, AlertTriangle, CheckCircle2, Wrench } from "lucide-react";
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

function HistoryPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [plate, setPlate] = useState("");
  const [driver, setDriver] = useState("");
  const [base, setBase] = useState("");
  const [type, setType] = useState("");
  const [issues, setIssues] = useState<"all"|"yes"|"no">("all");

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
    // Carrega fotos vinculadas aos checklists (resposta -> photo_url)
    const checklistIds = list.map((c) => c.id);
    const photosByChecklist: Record<string, string[]> = {};
    if (checklistIds.length) {
      const { data: resps } = await supabase
        .from("checklist_responses")
        .select("checklist_id, photo_url")
        .in("checklist_id", checklistIds)
        .not("photo_url", "is", null);
      for (const r of (resps ?? []) as Array<{ checklist_id: string; photo_url: string | null }>) {
        if (!r.photo_url) continue;
        (photosByChecklist[r.checklist_id] ||= []).push(r.photo_url);
      }
    }
    setRows(list.map((r) => ({
      ...r,
      profiles: map[r.driver_id] ?? null,
      photo_urls: photosByChecklist[r.id] ?? [],
      photo_count: (photosByChecklist[r.id] ?? []).length,
    })));
    setLoading(false);
  })(); }, []);

  const filtered = rows.filter((c) => {
    if (from && new Date(c.created_at) < new Date(from)) return false;
    if (to) { const t = new Date(to); t.setDate(t.getDate()+1); if (new Date(c.created_at) >= t) return false; }
    if (plate && !(c.vehicles?.plate ?? "").toLowerCase().includes(plate.toLowerCase())) return false;
    if (driver && !(c.profiles?.full_name ?? "").toLowerCase().includes(driver.toLowerCase())) return false;
    if (base && !(c.vehicles?.base ?? "").toLowerCase().includes(base.toLowerCase())) return false;
    if (type && c.vehicles?.vehicle_type !== type) return false;
    if (issues === "yes" && !c.has_issues) return false;
    if (issues === "no" && c.has_issues) return false;
    return true;
  });

  const data = () => filtered.map((c) => ({
    Data: new Date(c.created_at).toLocaleString("pt-BR"),
    Placa: c.vehicles?.plate ?? "", Modelo: c.vehicles?.model ?? "",
    Tipo: c.vehicles?.vehicle_type ?? "", Base: c.vehicles?.base ?? "",
    Motorista: c.profiles?.full_name ?? "", CPF: c.profiles?.cpf ?? "",
    Itinerário: c.itinerary ?? "", Status: c.has_issues ? "Com falhas" : "OK",
    Fotos: c.photo_count ?? 0,
    "URLs Fotos": (c.photo_urls ?? []).join(" | "),
  }));

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(data()); const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklists");
    XLSX.writeFile(wb, `historico_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    await applyPdfBranding(doc, "Histórico Geral de Checklists", `Total filtrado: ${filtered.length}`);
    const d = data();
    autoTable(doc, {
      startY: 32,
      head: [Object.keys(d[0] ?? { Data: "" })],
      body: d.map((r) => Object.values(r).map((v) => String(v))),
      styles: { fontSize: 7 }, headStyles: { fillColor: [30, 40, 80] },
    });
    doc.save(`historico_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Histórico Geral de Checklists</h1>
          <p className="text-sm text-muted-foreground">Pesquise todo o histórico desde o primeiro checklist</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={!filtered.length}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!filtered.length}><FileDown className="size-4" />PDF</Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="size-4" />Filtros</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label className="text-xs">Placa</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          <div><Label className="text-xs">Motorista</Label><Input value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
          <div><Label className="text-xs">Base</Label><Input value={base} onChange={(e) => setBase(e.target.value)} /></div>
          <div><Label className="text-xs">Categoria</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">Todas</option>
              <option value="PESADOS">Pesados</option>
              <option value="OPERACIONAIS">Operacionais</option>
              <option value="CESTO_AEREO">Cesto Aéreo</option>
              <option value="ADMINISTRATIVO">Administrativo</option>
              <option value="MUNCK">Munck</option>
            </select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <select value={issues} onChange={(e) => setIssues(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="all">Todos</option><option value="yes">Com falhas</option><option value="no">OK</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button variant="ghost" className="w-full" onClick={() => { setFrom(""); setTo(""); setPlate(""); setDriver(""); setBase(""); setType(""); setIssues("all"); }}>Limpar</Button>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{filtered.length} checklist(s)</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground">Nenhum resultado.</div>}
        <div className="divide-y divide-border max-h-[60vh] overflow-auto">
          {filtered.map((c) => (
            <div key={c.id} className="py-2 flex items-center gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{c.vehicles?.plate ?? "—"} <span className="text-xs font-normal text-muted-foreground">• {c.profiles?.full_name ?? "—"}</span></div>
                <div className="text-xs text-muted-foreground truncate">{new Date(c.created_at).toLocaleString("pt-BR")}{c.itinerary ? ` • ${c.itinerary}` : ""}{c.vehicles?.base ? ` • ${c.vehicles.base}` : ""}</div>
              </div>
              {c.has_issues
                ? <Link to="/admin/maintenance/$id" params={{ id: `new?checklist=${c.id}` }} className="hidden">_</Link>
                : null}
              {c.has_issues && isAdmin ? (
                <Link to="/admin/maintenance" search={{ checklist: c.id } as never} className="text-xs flex items-center gap-1 text-amber-600 hover:underline shrink-0">
                  <Wrench className="size-3" />Abrir SMV/SMI
                </Link>
              ) : null}
              {(c.photo_count ?? 0) > 0 && (
                <span className="text-xs text-muted-foreground shrink-0">{c.photo_count} foto(s)</span>
              )}
              {c.has_issues
                ? <span className="text-destructive flex items-center gap-1 text-xs shrink-0"><AlertTriangle className="size-3" />Falhas</span>
                : <span className="text-green-600 flex items-center gap-1 text-xs shrink-0"><CheckCircle2 className="size-3" />OK</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}