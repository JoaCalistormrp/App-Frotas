import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LogOut, Truck, CheckCircle2, XCircle, MinusCircle, AlertTriangle, ShieldCheck, User as UserIcon, Wrench, Lock, ArrowRight, Smartphone, Search, SlidersHorizontal, X as XIcon2 } from "lucide-react";
import { FileDown, FileSpreadsheet, Filter, Trash2, Camera, X as XIcon, Users, Bell, Upload, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

// ---------- PDF branding helpers ----------
let _logoCache: string | null = null;
async function getLogoDataUrl(): Promise<string> {
  if (_logoCache) return _logoCache;
  const res = await fetch(logoTomaz);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { _logoCache = r.result as string; resolve(_logoCache); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function applyPdfBranding(doc: jsPDF, title: string, subtitle?: string) {
  const logo = await getLogoDataUrl();
  const w = doc.internal.pageSize.getWidth();
  doc.addImage(logo, "PNG", 14, 8, 14, 14);
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text("Grupo Tomaz", 32, 15);
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(title, 32, 21);
  if (subtitle) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(subtitle, 32, 26);
  }
  doc.setDrawColor(200);
  doc.line(14, 28, w - 14, 28);
  doc.setTextColor(0);
  // Footer
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")} • Grupo Tomaz`, 14, h - 6);
  doc.setTextColor(0);
}

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading, isMechanic, isAdmin, isViewer, isDriver } = useAuth();

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <AuthScreen />;

  if (isAdmin || isViewer) return <Navigate to="/home" />;
  if (isMechanic || isDriver) return <Navigate to="/motorista" />;

  return <Navigate to="/home" />;
}

// --- TELA DE LOGIN ESTILO MOBILE APP ---
function AuthScreen() {
  const { signInUnified } = useAuth();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!credential.trim()) return toast.error("Informe CPF ou E-mail");
    if (!password.trim()) return toast.error("Informe a senha");
    setBusy(true);
    const r = await signInUnified(credential, password);
    setBusy(false);
    if (r.error) toast.error(r.error);
    else toast.success("Acesso autorizado!");
  };

  return (
    // Fundo em gradiente escuro moderno (baseado nas referências)
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-[#1E293B] to-slate-900">
      
      {/* Card flutuante estilo tela de celular */}
      <Card className="w-full max-w-[380px] bg-background/95 backdrop-blur-md rounded-[2.5rem] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-0 relative overflow-hidden">
        
        {/* Cabeçalho com Logo em "Avatar" */}
        <div className="flex flex-col items-center mb-8 pt-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg mb-6 p-3">
            <img src={logoTomaz} alt="Grupo Tomaz" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold text-foreground tracking-tight">Bem-vindo</h1>
          <p className="text-sm text-muted-foreground mt-1">Faça login para continuar</p>
        </div>
        
        <form onSubmit={submit} className="space-y-4">
          {/* Input CPF/Email com formato arredondado "pílula" */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground">
              <UserIcon className="size-5 opacity-70" />
            </div>
            <Input 
              value={credential} 
              onChange={(e) => setCredential(e.target.value)} 
              required 
              placeholder="CPF (só números) ou E-mail"
              className="pl-12 h-14 rounded-full bg-muted/50 border-transparent focus-visible:ring-primary focus-visible:border-primary text-base transition-all placeholder:text-muted-foreground/60"
            />
          </div>
          
          {/* Input Senha */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-muted-foreground">
              <Lock className="size-5 opacity-70" />
            </div>
            <Input 
              type="password"
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              required 
              placeholder="Sua senha" 
              className="pl-12 h-14 rounded-full bg-muted/50 border-transparent focus-visible:ring-primary focus-visible:border-primary text-base transition-all placeholder:text-muted-foreground/60"
            />
          </div>

          {/* Botão de Login Largo e Arredondado */}
          <div className="pt-2">
            <Button type="submit" className="w-full h-14 rounded-full text-base font-bold shadow-lg shadow-primary/30 hover:shadow-xl hover:scale-[1.02] transition-all" disabled={busy}>
              {busy ? "Entrando..." : "Entrar"}
            </Button>
          </div>
        </form>

        {/* Rodapé - App Download */}
        <div className="mt-8 mb-2 text-center">
          <Link to="/download" className="text-sm font-semibold text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-2">
            <Smartphone className="size-4" /> Baixar o Aplicativo
          </Link>
        </div>
      </Card>
      
      {/* Texto de direitos autorais fora do card na base da tela */}
      <div className="fixed bottom-4 text-[11px] text-white/40 uppercase tracking-widest text-center w-full pointer-events-none">
        Grupo Tomaz © {new Date().getFullYear()}
      </div>
    </div>
  );
}

// ================= APP SHELL (MOTORISTAS E RESTANTE) =================

export type Vehicle = { id: string; plate: string; model: string | null; vehicle_type: string; checklist_types: string[] | null; sector: string | null; base: string | null };

function AppShell({ onSignOut }: { onSignOut: () => void }) {
  const { isAdmin, user } = useAuth();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [activeChecklist, setActiveChecklist] = useState<string | null>(null);
  const [showAddVehicle, setShowAddVehicle] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("vehicles").select("*").eq("active", true).order("plate");
    setVehicles(data ?? []);
  };
  useEffect(() => { load(); }, []);

  if (activeChecklist) return <ChecklistRunner vehicleId={activeChecklist} onClose={() => setActiveChecklist(null)} onSubmitted={onSignOut} />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoTomaz} alt="Grupo Tomaz" className="h-10 w-auto object-contain" />
            <div>
              <div className="font-bold text-sm">Checklist Frota</div>
              <div className="text-[11px] text-muted-foreground">{user?.email} {isAdmin && <span className="text-primary font-semibold">• ADMIN</span>}</div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={onSignOut}><LogOut className="size-4" /></Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {isAdmin && (
          <Link to="/admin" className="block">
            <Card className="p-4 bg-primary text-primary-foreground hover:opacity-90 transition flex items-center justify-between">
              <div>
                <div className="font-bold">Abrir Painel Administrativo</div>
                <div className="text-xs opacity-80">Dashboard, histórico, veículos, motoristas e SMV/SMI</div>
              </div>
              <ShieldCheck className="size-6" />
            </Card>
          </Link>
        )}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">Selecione um veículo</h2>
            {isAdmin && <Button size="sm" onClick={() => setShowAddVehicle(true)}>+ Veículo</Button>}
          </div>
          {vehicles.length === 0 && (
            <Card className="p-6 text-center text-muted-foreground text-sm">
              {isAdmin ? "Nenhum veículo cadastrado. Adicione o primeiro." : "Nenhum veículo cadastrado. Peça ao administrador."}
            </Card>
          )}
          <VehicleListByCategory vehicles={vehicles} onSelect={setActiveChecklist} />
        </section>

        {isAdmin && <AdminPanel onChange={load} />}
      </main>

      {showAddVehicle && <AddVehicleModal onClose={() => { setShowAddVehicle(false); load(); }} />}
      <footer className="border-t border-border bg-card px-4 py-2 text-center text-[11px] text-muted-foreground mt-8">
        Desenvolvido por Julia Ramos
      </footer>
    </div>
  );
}

const VEHICLE_TYPE_LABELS: Record<string, string> = {
  PESADOS: "Pesados",
  OPERACIONAIS: "Operacionais",
  CESTO_AEREO: "Cesto Aéreo",
  ADMINISTRATIVO: "Administrativo",
  MUNCK: "Munck",
};

export function VehicleListByCategory({ vehicles, onSelect }: { vehicles: Vehicle[]; onSelect: (id: string) => void }) {
  const [showFilter, setShowFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");

  const activeCount = (search.trim() ? 1 : 0) + (catFilter ? 1 : 0);

  const q = search.toLowerCase();
  const filtered = vehicles.filter((v) => {
    if (catFilter && v.vehicle_type !== catFilter) return false;
    if (q) return v.plate.toLowerCase().includes(q) || (v.model ?? "").toLowerCase().includes(q);
    return true;
  });

  const grouped = filtered.reduce<Record<string, Vehicle[]>>((acc, v) => {
    (acc[v.vehicle_type] ||= []).push(v);
    return acc;
  }, {});

  const order = ["PESADOS", "OPERACIONAIS", "CESTO_AEREO", "ADMINISTRATIVO", "MUNCK"];
  const availableTypes = order.filter((t) => vehicles.some((v) => v.vehicle_type === t));

  const clearFilters = () => { setSearch(""); setCatFilter(""); };

  return (
    <div className="space-y-3">
      {/* Barra de topo */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{vehicles.length} veículo(s) disponíveis</p>
        <Button
          variant={showFilter ? "secondary" : "outline"}
          size="sm"
          className="shrink-0 gap-1.5 relative"
          onClick={() => setShowFilter((v) => !v)}
        >
          <SlidersHorizontal className="size-3.5" />
          Filtros
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
              {activeCount}
            </span>
          )}
        </Button>
      </div>

      {/* Painel de filtros (oculto por padrão) */}
      {showFilter && (
        <Card className="p-3 border-dashed border-primary/30 bg-primary/[0.02] space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por placa ou modelo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button size="sm" variant={catFilter === "" ? "default" : "outline"} onClick={() => setCatFilter("")} className="h-7 text-xs">
              Todos
            </Button>
            {availableTypes.map((t) => (
              <Button key={t} size="sm" variant={catFilter === t ? "default" : "outline"} onClick={() => setCatFilter(t)} className="h-7 text-xs">
                {VEHICLE_TYPE_LABELS[t] ?? t}
              </Button>
            ))}
          </div>
          {activeCount > 0 && (
            <div className="flex justify-end">
              <button type="button" onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <XIcon2 className="size-3" /> Limpar filtros
              </button>
            </div>
          )}
        </Card>
      )}

      {/* Resultados */}
      {filtered.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">Nenhum veículo encontrado.</p>
      )}

      <div className="space-y-5">
        {order.filter((t) => grouped[t]?.length).map((type) => (
          <div key={type} className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">{VEHICLE_TYPE_LABELS[type] ?? type}</h3>
              <span className="text-xs text-muted-foreground">({grouped[type].length})</span>
            </div>
            <div className="grid gap-2">
              {grouped[type].map((v) => (
                <button key={v.id} onClick={() => onSelect(v.id)}
                  className="text-left p-4 rounded-xl bg-card border border-border hover:border-primary transition flex items-center justify-between">
                  <div>
                    <div className="font-bold tracking-wide">{v.plate}</div>
                    <div className="text-xs text-muted-foreground">{v.model || "—"}{v.base ? ` • ${v.base}` : ""}</div>
                  </div>
                  <div className="text-primary text-sm font-semibold">Iniciar →</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddVehicleModal({ onClose }: { onClose: () => void }) {
  const [plate, setPlate] = useState("");
  const [model, setModel] = useState("");
  const [type, setType] = useState("PESADOS");
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!plate.trim()) return toast.error("Informe a placa");
    setBusy(true);
    const { error } = await supabase.from("vehicles").insert({ plate: plate.toUpperCase().trim(), model, vehicle_type: type as never, base });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Veículo cadastrado"); onClose(); }
  };

  return (
    <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur grid place-items-center p-4">
      <Card className="w-full max-w-md p-5 space-y-3">
        <h3 className="font-bold text-lg">Novo veículo</h3>
        <div><Label>Placa</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC1D23" /></div>
        <div><Label>Modelo</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
        <div><Label>Tipo</Label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="PESADOS">Pesados</option>
            <option value="OPERACIONAIS">Operacionais</option>
            <option value="CESTO_AEREO">Cesto Aéreo</option>
            <option value="ADMINISTRATIVO">Administrativo</option>
            <option value="MUNCK">Munck</option>
          </select>
        </div>
        <div><Label>Base</Label><Input value={base} onChange={(e) => setBase(e.target.value)} placeholder="VOTORANTIM" /></div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>Salvar</Button>
        </div>
      </Card>
    </div>
  );
}

type HistoryRow = {
  id: string;
  created_at: string;
  has_issues: boolean;
  itinerary: string | null;
  odometer_start: number | null;
  status: string;
  vehicles: { plate: string; model: string | null; vehicle_type: string; base: string | null } | null;
  profiles: { full_name: string | null; cpf: string | null } | null;
};

function AdminPanel({ onChange: _ }: { onChange: () => void }) {
  const [all, setAll] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [plate, setPlate] = useState("");
  const [type, setType] = useState("");
  const [issues, setIssues] = useState<"all" | "yes" | "no">("all");
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("checklists")
        .select("id, driver_id, created_at, has_issues, itinerary, odometer_start, status, vehicles(plate, model, vehicle_type, base)")
        .order("created_at", { ascending: false }).limit(1000);
      const list = (data ?? []) as never as Array<HistoryRow & { driver_id: string }>;
      const ids = Array.from(new Set(list.map((c) => c.driver_id).filter(Boolean)));
      let profileMap: Record<string, { full_name: string | null; cpf: string | null }> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name, cpf").in("id", ids);
        profileMap = Object.fromEntries((profs ?? []).map((p) => [p.id, { full_name: p.full_name, cpf: p.cpf }]));
      }
      setAll(list.map((c) => ({ ...c, profiles: profileMap[c.driver_id] ?? null })));
      setLoading(false);
    })();
  }, []);

  const filtered = all.filter((c) => {
    if (from && new Date(c.created_at) < new Date(from)) return false;
    if (to) { const t = new Date(to); t.setDate(t.getDate() + 1); if (new Date(c.created_at) >= t) return false; }
    if (plate && !(c.vehicles?.plate ?? "").toLowerCase().includes(plate.toLowerCase())) return false;
    if (type && c.vehicles?.vehicle_type !== type) return false;
    if (issues === "yes" && !c.has_issues) return false;
    if (issues === "no" && c.has_issues) return false;
    return true;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const stats = {
    total: filtered.length,
    issues: filtered.filter((c) => c.has_issues).length,
    today: filtered.filter((c) => new Date(c.created_at) >= today).length,
  };

  const rows = () => filtered.map((c) => ({
    Data: new Date(c.created_at).toLocaleString("pt-BR"),
    Placa: c.vehicles?.plate ?? "",
    Modelo: c.vehicles?.model ?? "",
    Tipo: VEHICLE_TYPE_LABELS[c.vehicles?.vehicle_type ?? ""] ?? c.vehicles?.vehicle_type ?? "",
    Base: c.vehicles?.base ?? "",
    Motorista: c.profiles?.full_name ?? "",
    CPF: c.profiles?.cpf ?? "",
    Itinerário: c.itinerary ?? "",
    Odômetro: c.odometer_start ?? "",
    Status: c.has_issues ? "Com falhas" : "OK",
  }));

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(rows());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Checklists");
    XLSX.writeFile(wb, `checklists_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportPdf = async () => {
    const doc = new jsPDF({ orientation: "landscape" });
    await applyPdfBranding(
      doc,
      "Relatório de Checklists",
      `Total: ${stats.total} • Com falhas: ${stats.issues} • Hoje: ${stats.today}`,
    );
    const data = rows();
    autoTable(doc, {
      startY: 32,
      head: [Object.keys(data[0] ?? { Data: "", Placa: "", Tipo: "", Motorista: "", Status: "" })],
      body: data.map((r) => Object.values(r).map((v) => String(v))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 40, 80] },
    });
    doc.save(`checklists_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Painel admin</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={exportExcel} disabled={!filtered.length}><FileSpreadsheet className="size-4" />Excel</Button>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!filtered.length}><FileDown className="size-4" />PDF</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Hoje</div><div className="text-2xl font-bold">{stats.today}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Filtrados</div><div className="text-2xl font-bold">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Com falhas</div><div className="text-2xl font-bold text-destructive">{stats.issues}</div></Card>
      </div>

      <Card className="p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Filter className="size-4" />Filtros</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div><Label className="text-xs">Placa</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC..." /></div>
          <div><Label className="text-xs">Tipo</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">Todos</option>
              {Object.entries(VEHICLE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Falhas</Label>
            <select value={issues} onChange={(e) => setIssues(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="all">Todas</option>
              <option value="yes">Apenas com falhas</option>
              <option value="no">Apenas OK</option>
            </select>
          </div>
          <div className="flex items-end"><Button variant="ghost" className="w-full" onClick={() => { setFrom(""); setTo(""); setPlate(""); setType(""); setIssues("all"); }}>Limpar</Button></div>
        </div>
      </Card>

      <CnhAlerts />
      <DriversPanel />

      <Card className="p-3">
        <div className="font-semibold text-sm mb-2">Histórico ({filtered.length})</div>
        {loading && <div className="text-xs text-muted-foreground">Carregando…</div>}
        {!loading && filtered.length === 0 && <div className="text-xs text-muted-foreground">Nenhum checklist no filtro.</div>}
        <div className="divide-y divide-border max-h-[500px] overflow-auto">
          {filtered.map((c) => (
            <div key={c.id} className="w-full py-2 flex items-center gap-2 text-sm hover:bg-muted/30 px-1 rounded">
              <button onClick={() => setDetail(c.id)} className="flex-1 min-w-0 text-left flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">{c.vehicles?.plate ?? "—"} <span className="text-xs text-muted-foreground font-normal">• {c.profiles?.full_name ?? "—"}</span></div>
                  <div className="text-xs text-muted-foreground truncate">{new Date(c.created_at).toLocaleString("pt-BR")}{c.itinerary ? ` • ${c.itinerary}` : ""}</div>
                </div>
                {c.has_issues
                  ? <span className="text-destructive flex items-center gap-1 text-xs shrink-0"><AlertTriangle className="size-4" />Com falhas</span>
                  : <span className="text-[color:var(--success)] flex items-center gap-1 text-xs shrink-0"><CheckCircle2 className="size-4" />OK</span>}
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                onClick={async () => {
                  if (!confirm(`Apagar checklist de ${c.vehicles?.plate ?? "—"} de ${new Date(c.created_at).toLocaleString("pt-BR")}? Esta ação não pode ser desfeita.`)) return;
                  await supabase.from("checklist_responses").delete().eq("checklist_id", c.id);
                  const { error } = await supabase.from("checklists").delete().eq("id", c.id);
                  if (error) { toast.error("Falha ao apagar"); return; }
                  setAll((prev) => prev.filter((x) => x.id !== c.id));
                  toast.success("Checklist apagado");
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {detail && <ChecklistDetailModal id={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}

function ChecklistDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<{ checklist: HistoryRow | null; responses: Array<{ status: string; observation: string | null; photo_url: string | null; checklist_items: { name: string; checklist_categories: { name: string } | null } | null }> }>({ checklist: null, responses: [] });
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const { data: ck } = await supabase.from("checklists")
        .select("id, driver_id, created_at, has_issues, itinerary, odometer_start, status, vehicles(plate, model, vehicle_type, base)")
        .eq("id", id).single();
      let profile: { full_name: string | null; cpf: string | null } | null = null;
      if (ck?.driver_id) {
        const { data: p } = await supabase.from("profiles").select("full_name, cpf").eq("id", ck.driver_id).maybeSingle();
        profile = p;
      }
      const { data: resp } = await supabase.from("checklist_responses")
        .select("status, observation, photo_url, checklist_items(name, checklist_categories(name))")
        .eq("checklist_id", id);
      const merged = ck ? ({ ...(ck as object), profiles: profile } as unknown as HistoryRow) : null;
      setData({ checklist: merged, responses: (resp ?? []) as never });
      // signed urls for photos
      const paths = (resp ?? []).map((r: { photo_url: string | null }) => r.photo_url).filter(Boolean) as string[];
      if (paths.length) {
        const signed: Record<string, string> = {};
        await Promise.all(paths.map(async (p) => {
          const { data: s } = await supabase.storage.from("checklist-photos").createSignedUrl(p, 3600);
          if (s?.signedUrl) signed[p] = s.signedUrl;
        }));
        setPhotoUrls(signed);
      }
    })();
  }, [id]);

  const exportPdf = async () => {
    if (!data.checklist) return;
    const c = data.checklist;
    const doc = new jsPDF();
    await applyPdfBranding(
      doc,
      `Checklist • ${c.vehicles?.plate ?? ""}`,
      `${VEHICLE_TYPE_LABELS[c.vehicles?.vehicle_type ?? ""] ?? ""} • ${new Date(c.created_at).toLocaleString("pt-BR")}`,
    );
    doc.setFontSize(10);
    const info = [
      `Placa: ${c.vehicles?.plate ?? ""} (${c.vehicles?.model ?? ""})`,
      `Tipo: ${VEHICLE_TYPE_LABELS[c.vehicles?.vehicle_type ?? ""] ?? ""}`,
      `Motorista: ${c.profiles?.full_name ?? ""}`,
      `Data: ${new Date(c.created_at).toLocaleString("pt-BR")}`,
      `Itinerário: ${c.itinerary ?? "—"}`,
      `Odômetro: ${c.odometer_start ?? "—"}`,
      `Status: ${c.has_issues ? "Com falhas" : "OK"}`,
    ];
    info.forEach((t, i) => doc.text(t, 14, 36 + i * 6));
    autoTable(doc, {
      startY: 36 + info.length * 6 + 4,
      head: [["Categoria", "Item", "Status", "Observação"]],
      body: data.responses.map((r) => [
        r.checklist_items?.checklist_categories?.name ?? "",
        r.checklist_items?.name ?? "",
        r.status,
        r.observation ?? "",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 40, 80] },
    });
    // Append photos page(s)
    const photoResps = data.responses.filter((r) => r.photo_url);
    if (photoResps.length) {
      doc.addPage();
      await applyPdfBranding(doc, "Evidências fotográficas", `Checklist ${c.vehicles?.plate ?? ""}`);
      let y = 36;
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      for (const r of photoResps) {
        const url = photoUrls[r.photo_url!];
        if (!url) continue;
        try {
          const dataUrl = await urlToDataUrl(url);
          const label = `${r.checklist_items?.name ?? ""} — ${r.observation ?? ""}`;
          if (y > pageH - 90) { doc.addPage(); await applyPdfBranding(doc, "Evidências fotográficas", `Checklist ${c.vehicles?.plate ?? ""}`); y = 36; }
          doc.setFontSize(9); doc.text(label.slice(0, 100), 14, y);
          doc.addImage(dataUrl, "JPEG", 14, y + 3, 80, 60, undefined, "FAST");
          y += 72;
        } catch { /* skip broken */ }
      }
    }
    doc.save(`checklist_${c.vehicles?.plate ?? id}_${new Date(c.created_at).toISOString().slice(0, 10)}.pdf`);
  };

  const c = data.checklist;
  return (
    <div className="fixed inset-0 z-20 bg-background/80 backdrop-blur grid place-items-center p-4">
      <Card className="w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Detalhes do checklist</h3>
          <Button size="sm" variant="outline" onClick={exportPdf} disabled={!c}><FileDown className="size-4" />PDF</Button>
        </div>
        {!c ? <div className="text-sm text-muted-foreground">Carregando…</div> : (
          <>
            <div className="text-sm space-y-1">
              <div><b>Placa:</b> {c.vehicles?.plate} ({c.vehicles?.model || "—"})</div>
              <div><b>Motorista:</b> {c.profiles?.full_name ?? "—"}</div>
              <div><b>Data:</b> {new Date(c.created_at).toLocaleString("pt-BR")}</div>
              <div><b>Itinerário:</b> {c.itinerary ?? "—"} • <b>Odômetro:</b> {c.odometer_start ?? "—"}</div>
              <div><b>Status:</b> {c.has_issues ? <span className="text-destructive">Com falhas</span> : <span className="text-[color:var(--success)]">OK</span>}</div>
            </div>
            <div className="border border-border rounded-md divide-y divide-border text-sm">
              {data.responses.map((r, i) => (
                <div key={i} className="p-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{r.checklist_items?.name}</div>
                    <div className="text-xs text-muted-foreground">{r.checklist_items?.checklist_categories?.name}{r.observation ? ` • ${r.observation}` : ""}</div>
                    {r.photo_url && photoUrls[r.photo_url] && (
                      <a href={photoUrls[r.photo_url]} target="_blank" rel="noreferrer" className="inline-block mt-1">
                        <img src={photoUrls[r.photo_url]} alt="Evidência" className="h-20 w-20 object-cover rounded border border-border" />
                      </a>
                    )}
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${r.status === "NAO_OK" ? "text-destructive" : r.status === "OK" ? "text-[color:var(--success)]" : "text-muted-foreground"}`}>{r.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <Button variant="ghost" className="w-full" onClick={onClose}>Fechar</Button>
      </Card>
    </div>
  );
}

type Item = { id: string; name: string; category_id: string };
type Category = { id: string; name: string; sort_order: number };
type Resp = { status: "OK" | "NAO_OK" | "NA" | null; observation: string; photo: File | null; photoPreview: string | null };

function compressImage(file: File, maxPx = 1280, quality = 0.75): Promise<File> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(blobUrl);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Falha ao comprimir imagem"));
          resolve(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        },
        "image/jpeg",
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error("Falha ao carregar imagem")); };
    img.src = blobUrl;
  });
}

export function ChecklistRunner({ vehicleId, onClose, onSubmitted, embedded = false }: { vehicleId: string; onClose: () => void; onSubmitted?: () => void; embedded?: boolean }) {
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<Record<string, Resp>>({});
  const [itinerary, setItinerary] = useState("");
  const [odometer, setOdometer] = useState("");
  const [busy, setBusy] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: v } = await supabase.from("vehicles").select("*").eq("id", vehicleId).single();
      if (!v) return;
      setVehicle(v);
      const { data: tpl } = await supabase.from("checklist_templates").select("id").eq("vehicle_type", v.vehicle_type).single();
      if (!tpl) return;
      setTemplateId(tpl.id);
      const { data: c } = await supabase.from("checklist_categories").select("*").eq("template_id", tpl.id).order("sort_order");
      setCats(c ?? []);
      const ids = (c ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: it } = await supabase.from("checklist_items").select("*").in("category_id", ids).order("sort_order");
        setItems(it ?? []);
        const init: Record<string, Resp> = {};
        (it ?? []).forEach((x) => { init[x.id] = { status: null, observation: "", photo: null, photoPreview: null }; });
        setResponses(init);
      }
    })();
  }, [vehicleId]);

  const setStatus = (itemId: string, status: Resp["status"]) =>
    setResponses((r) => ({ ...r, [itemId]: { ...r[itemId], status } }));
  const setObs = (itemId: string, observation: string) =>
    setResponses((r) => ({ ...r, [itemId]: { ...r[itemId], observation } }));
  const setPhoto = async (itemId: string, file: File | null) => {
    if (!file) {
      setResponses((r) => {
        const prev = r[itemId];
        if (prev?.photoPreview) URL.revokeObjectURL(prev.photoPreview);
        return { ...r, [itemId]: { ...prev, photo: null, photoPreview: null } };
      });
      return;
    }
    try {
      const compressed = await compressImage(file);
      const preview = URL.createObjectURL(compressed);
      setResponses((r) => {
        const prev = r[itemId];
        if (prev?.photoPreview) URL.revokeObjectURL(prev.photoPreview);
        return { ...r, [itemId]: { ...prev, photo: compressed, photoPreview: preview } };
      });
    } catch {
      toast.error("Não foi possível processar a foto. Tente novamente.");
    }
  };

  const submit = async () => {
    if (!user || !templateId) return;
    const missing = items.filter((i) => !responses[i.id]?.status);
    if (missing.length) return toast.error(`Responda todos os itens (${missing.length} faltando)`);
    const missingObs = items.filter((i) => responses[i.id]?.status === "NAO_OK" && !responses[i.id]?.observation.trim());
    if (missingObs.length) return toast.error(`Observação obrigatória em itens "Não OK"`);

    setBusy(true);
    const hasIssues = items.some((i) => responses[i.id]?.status === "NAO_OK");
    const { data: ck, error } = await supabase.from("checklists").insert({
      vehicle_id: vehicleId, driver_id: user.id, template_id: templateId,
      itinerary, odometer_start: odometer ? Number(odometer) : null,
      status: "completed", has_issues: hasIssues, completed_at: new Date().toISOString(),
    }).select("id").single();
    if (error || !ck) { setBusy(false); return toast.error(error?.message ?? "Erro"); }

    // Upload photos for items marked NAO_OK
    const photoPaths: Record<string, string> = {};
    for (const i of items) {
      const f = responses[i.id]?.photo;
      if (!f) continue;
      const path = `${ck.id}/${i.id}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("checklist-photos")
        .upload(path, f, { upsert: true, contentType: "image/jpeg" });
      if (!upErr) photoPaths[i.id] = path;
    }
    const rows = items.map((i) => ({
      checklist_id: ck.id, item_id: i.id,
      status: responses[i.id].status as "OK" | "NAO_OK" | "NA",
      observation: responses[i.id].observation || null,
      photo_url: photoPaths[i.id] || null,
    }));
    const { error: e2 } = await supabase.from("checklist_responses").insert(rows);
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success("Checklist enviado!");
    if (onSubmitted) onSubmitted();
    else onClose();
  };

  if (!vehicle) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;

  const isEmbedded = embedded;

  return (
    <div
      className={isEmbedded ? "flex flex-col bg-background" : "min-h-screen bg-background pb-32"}
      style={isEmbedded ? {} : {
        backgroundImage: `linear-gradient(rgba(255,255,255,0.9), rgba(255,255,255,0.9)), url(${logoTomaz})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center 40%",
        backgroundSize: "min(70vw, 480px)",
        backgroundAttachment: "fixed",
      }}
    >
      <header className={isEmbedded ? "flex items-center justify-between py-2 border-b border-border mb-4" : "sticky top-0 z-10 bg-card border-b border-border"}>
        <div className={isEmbedded ? "flex items-center justify-between w-full" : "max-w-3xl mx-auto px-4 py-3 flex items-center justify-between"}>
          <button onClick={onClose} className="text-sm text-muted-foreground">← Voltar</button>
          <div className="text-right">
            <div className="font-bold">{vehicle.plate}</div>
            <div className="text-[11px] text-muted-foreground">{vehicle.vehicle_type.replace("_", " ")}</div>
          </div>
        </div>
      </header>

      <main className={isEmbedded ? "flex-1 space-y-4 pb-4" : "max-w-3xl mx-auto px-4 py-4 space-y-4"}>
        <Card className="p-4 space-y-3">
          <div><Label>Itinerário / Destino</Label><Input value={itinerary} onChange={(e) => setItinerary(e.target.value)} /></div>
          <div><Label>Odômetro</Label><Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></div>
        </Card>

        {cats.map((cat) => (
          <section key={cat.id} className="space-y-2">
            <h3 className="font-bold text-sm uppercase tracking-wider text-primary">{cat.name}</h3>
            <Card className="divide-y divide-border">
              {items.filter((i) => i.category_id === cat.id).map((it) => {
                const r = responses[it.id] ?? { status: null, observation: "", photo: null, photoPreview: null };
                return (
                  <div key={it.id} className="p-3 space-y-2">
                    <div className="text-sm font-medium">{it.name}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <StatusBtn label="OK" active={r.status === "OK"} variant="ok" onClick={() => setStatus(it.id, "OK")} />
                      <StatusBtn label="Não OK" active={r.status === "NAO_OK"} variant="nok" onClick={() => setStatus(it.id, "NAO_OK")} />
                      <StatusBtn label="N/A" active={r.status === "NA"} variant="na" onClick={() => setStatus(it.id, "NA")} />
                    </div>
                    {r.status === "NAO_OK" && (
                      <>
                        <Textarea placeholder="Descreva o problema (obrigatório)" value={r.observation}
                          onChange={(e) => setObs(it.id, e.target.value)} rows={2} />
                        <div className="flex items-center gap-2 flex-wrap">
                          <label className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-card text-xs font-medium cursor-pointer hover:bg-muted">
                            <Camera className="size-4" />
                            {r.photo ? "Trocar foto do dano" : "Tirar foto do dano"}
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => setPhoto(it.id, e.target.files?.[0] ?? null)}
                            />
                          </label>
                          {r.photo && (
                            <button
                              type="button"
                              onClick={() => setPhoto(it.id, null)}
                              className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
                            >
                              <XIcon className="size-3" />Remover
                            </button>
                          )}
                        </div>
                        {r.photoPreview && (
                          <img src={r.photoPreview} alt="Prévia do dano" className="h-24 w-24 object-cover rounded border border-border" />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </main>

      <div className={isEmbedded
        ? "sticky bottom-0 bg-card border-t border-border p-3 mt-4"
        : "fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3"
      }>
        <div className="max-w-3xl mx-auto">
          <Button className="w-full h-12 text-base font-bold" onClick={submit} disabled={busy}>
            {busy ? "Enviando..." : "Finalizar checklist"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBtn({ label, active, variant, onClick }: { label: string; active: boolean; variant: "ok" | "nok" | "na"; onClick: () => void }) {
  const base = "h-11 rounded-lg text-sm font-bold border transition flex items-center justify-center gap-1";
  const styles = active
    ? variant === "ok" ? "bg-[color:var(--success)] text-background border-transparent"
    : variant === "nok" ? "bg-destructive text-destructive-foreground border-transparent"
    : "bg-muted text-foreground border-transparent"
    : "bg-transparent text-muted-foreground border-border hover:border-primary";
  const Icon = variant === "ok" ? CheckCircle2 : variant === "nok" ? XCircle : MinusCircle;
  return <button type="button" onClick={onClick} className={`${base} ${styles}`}><Icon className="size-4" />{label}</button>;
}

// ================= Drivers / CNH =================
type DriverRow = {
  id: string;
  full_name: string | null;
  cpf: string | null;
  cnh: string | null;
  cnh_category: string | null;
  cnh_expires_at: string | null;
  cnh_file_url: string | null;
  phone: string | null;
  company: string | null;
};

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - today.getTime()) / 86400000);
}

function cnhStatus(date: string | null): { label: string; tone: "ok" | "warn" | "danger" | "muted" } {
  const d = daysUntil(date);
  if (d === null) return { label: "Sem data", tone: "muted" };
  if (d < 0) return { label: `Vencida há ${Math.abs(d)}d`, tone: "danger" };
  if (d <= 30) return { label: `Vence em ${d}d`, tone: "warn" };
  return { label: `Válida (${d}d)`, tone: "ok" };
}

function CnhAlerts() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, cpf, cnh, cnh_category, cnh_expires_at, cnh_file_url, phone, company")
        .not("cnh_expires_at", "is", null);
      setDrivers((data ?? []) as DriverRow[]);
    })();
  }, []);
  const expired = drivers.filter((d) => (daysUntil(d.cnh_expires_at) ?? 999) < 0);
  const expiring = drivers.filter((d) => {
    const x = daysUntil(d.cnh_expires_at);
    return x !== null && x >= 0 && x <= 30;
  });
  if (!expired.length && !expiring.length) return null;
  return (
    <Card className="p-3 border-l-4 border-l-destructive bg-destructive/5">
      <div className="flex items-center gap-2 font-semibold text-sm mb-2">
        <Bell className="size-4 text-destructive" />
        Alertas de CNH
      </div>
      {expired.length > 0 && (
        <div className="mb-2">
          <div className="text-xs font-bold text-destructive mb-1">Vencidas ({expired.length})</div>
          <ul className="text-xs space-y-1">
            {expired.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate">{d.full_name ?? "—"} {d.cnh ? `• ${d.cnh}` : ""}</span>
                <span className="text-destructive shrink-0">{cnhStatus(d.cnh_expires_at).label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {expiring.length > 0 && (
        <div>
          <div className="text-xs font-bold text-[color:var(--warning,#b45309)] mb-1">A vencer em 30 dias ({expiring.length})</div>
          <ul className="text-xs space-y-1">
            {expiring.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate">{d.full_name ?? "—"} {d.cnh ? `• ${d.cnh}` : ""}</span>
                <span className="shrink-0">{cnhStatus(d.cnh_expires_at).label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function DriversPanel() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ok" | "warn" | "danger" | "missing">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    // Get drivers (users with role = 'driver')
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "driver");
    const ids = (roles ?? []).map((r) => r.user_id);
    if (!ids.length) { setDrivers([]); setLoading(false); return; }
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, cpf, cnh, cnh_category, cnh_expires_at, cnh_file_url, phone, company")
      .in("id", ids)
      .order("full_name");
    setDrivers((data ?? []) as DriverRow[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = drivers.filter((d) => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${d.full_name ?? ""} ${d.cpf ?? ""} ${d.cnh ?? ""} ${d.phone ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (statusFilter !== "all") {
      if (statusFilter === "missing") { if (d.cnh_expires_at) return false; }
      else { if (cnhStatus(d.cnh_expires_at).tone !== statusFilter) return false; }
    }
    return true;
  });

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-sm"><Users className="size-4" />Motoristas ({drivers.length})</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="md:col-span-2">
          <Label className="text-xs">Buscar (nome, CPF, CNH, telefone)</Label>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para filtrar..." />
        </div>
        <div>
          <Label className="text-xs">Status da CNH</Label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="all">Todos</option>
            <option value="ok">Válida</option>
            <option value="warn">A vencer (30d)</option>
            <option value="danger">Vencida</option>
            <option value="missing">Sem cadastro</option>
          </select>
        </div>
      </div>
      {loading && <div className="text-xs text-muted-foreground">Carregando…</div>}
      {!loading && filtered.length === 0 && <div className="text-xs text-muted-foreground">Nenhum motorista encontrado.</div>}
      <div className="divide-y divide-border max-h-[400px] overflow-auto">
        {filtered.map((d) => {
          const st = cnhStatus(d.cnh_expires_at);
          const toneCls = st.tone === "danger" ? "text-destructive"
            : st.tone === "warn" ? "text-amber-600"
            : st.tone === "ok" ? "text-[color:var(--success)]"
            : "text-muted-foreground";
          return (
            <button key={d.id} onClick={() => setSelected(d.id)} className="w-full py-2 px-1 flex items-center justify-between gap-2 text-sm hover:bg-muted/30 rounded text-left">
              <div className="min-w-0">
                <div className="font-bold truncate">{d.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {d.cpf ? `CPF ${d.cpf}` : "sem CPF"} {d.cnh ? `• CNH ${d.cnh}` : ""} {d.cnh_category ? `(${d.cnh_category})` : ""}
                </div>
              </div>
              <div className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${toneCls}`}>
                {d.cnh_file_url && <FileText className="size-3" />}
                {st.label}
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <DriverDetailModal
          driver={drivers.find((d) => d.id === selected)!}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); load(); }}
        />
      )}
    </Card>
  );
}

function DriverDetailModal({ driver, onClose, onSaved }: { driver: DriverRow; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(driver.full_name ?? "");
  const [cpf, setCpf] = useState(driver.cpf ?? "");
  const [cnh, setCnh] = useState(driver.cnh ?? "");
  const [cat, setCat] = useState(driver.cnh_category ?? "");
  const [expires, setExpires] = useState(driver.cnh_expires_at ?? "");
  const [phone, setPhone] = useState(driver.phone ?? "");
  const [company, setCompany] = useState(driver.company ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!driver.cnh_file_url) return;
      const { data } = await supabase.storage.from("driver-docs").createSignedUrl(driver.cnh_file_url, 600);
      setPreviewUrl(data?.signedUrl ?? null);
    })();
  }, [driver.cnh_file_url]);

  const save = async () => {
    setBusy(true);
    try {
      let filePath = driver.cnh_file_url;
      if (file) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${driver.id}/cnh-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("driver-docs").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        filePath = path;
      }
      const { error } = await supabase.from("profiles").update({
        full_name: fullName || null,
        cpf: cpf || null,
        cnh: cnh || null,
        cnh_category: cat || null,
        cnh_expires_at: expires || null,
        cnh_file_url: filePath,
        phone: phone || null,
        company: company || null,
      }).eq("id", driver.id);
      if (error) throw error;
      toast.success("Motorista atualizado");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-lg p-4 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Cadastro do motorista</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <div><Label className="text-xs">Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} /></div>
            <div><Label className="text-xs">Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2"><Label className="text-xs">Nº CNH</Label><Input value={cnh} onChange={(e) => setCnh(e.target.value)} /></div>
            <div><Label className="text-xs">Cat.</Label>
              <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="">—</option>
                {["A","B","AB","C","D","E","AC","AD","AE"].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div><Label className="text-xs">Vencimento da CNH</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <Label className="text-xs flex items-center gap-1"><Upload className="size-3" />Anexar CNH (foto ou PDF)</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <div className="text-xs text-muted-foreground">Selecionado: {file.name}</div>}
          {previewUrl && !file && (
            <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1">
              <FileText className="size-3" />Ver CNH anexada
            </a>
          )}
        </div>

        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? "..." : "Salvar"}</Button>
        </div>
      </Card>
    </div>
  );
}