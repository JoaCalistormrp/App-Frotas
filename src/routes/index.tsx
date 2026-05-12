import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { LogOut, Truck, CheckCircle2, XCircle, MinusCircle, AlertTriangle, ShieldCheck, User as UserIcon } from "lucide-react";
import { FileDown, FileSpreadsheet, Filter, Trash2 } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <AuthScreen />;
  return <AppShell onSignOut={signOut} />;
}

function AuthScreen() {
  const { signIn, signUp, signInEmail } = useAuth();
  const [tab, setTab] = useState<"driver" | "admin">("driver");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [cpf, setCpf] = useState("");
  const [cnh, setCnh] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = tab === "admin"
      ? await signInEmail(email, password)
      : mode === "in"
        ? await signIn(cpf, password)
        : await signUp(name, cpf, cnh, password);
    setBusy(false);
    if (r.error) toast.error(r.error);
    else if (mode === "up") toast.success("Conta criada! Você já pode entrar.");
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex flex-col items-center gap-3 pt-2">
          <img src={logoTomaz} alt="Grupo Tomaz" className="h-20 w-auto object-contain" />
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Checklist Frota</h1>
            <p className="text-xs text-muted-foreground">Inspeção veicular digital</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-lg">
          <button type="button" onClick={() => setTab("driver")}
            className={`h-9 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${tab === "driver" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
            <UserIcon className="size-4" />Motorista
          </button>
          <button type="button" onClick={() => setTab("admin")}
            className={`h-9 rounded-md text-sm font-semibold flex items-center justify-center gap-1.5 transition ${tab === "admin" ? "bg-card text-foreground shadow" : "text-muted-foreground"}`}>
            <ShieldCheck className="size-4" />Administrador
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {tab === "driver" && mode === "up" && (
            <>
              <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div><Label>CNH (nº de registro)</Label><Input value={cnh} onChange={(e) => setCnh(e.target.value)} required /></div>
            </>
          )}
          {tab === "driver"
            ? <div><Label>CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} required placeholder="000.000.000-00" /></div>
            : <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@empresa.com" /></div>}
          <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
          <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
            {busy ? "..." : tab === "admin" ? "Entrar como admin" : mode === "in" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        {tab === "driver" && (
          <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm text-primary w-full">
            {mode === "in" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
          </button>
        )}
      </Card>
    </div>
  );
}

type Vehicle = { id: string; plate: string; model: string | null; vehicle_type: string; sector: string | null; base: string | null };

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

  if (activeChecklist) return <ChecklistRunner vehicleId={activeChecklist} onClose={() => setActiveChecklist(null)} />;

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

function VehicleListByCategory({ vehicles, onSelect }: { vehicles: Vehicle[]; onSelect: (id: string) => void }) {
  const grouped = vehicles.reduce<Record<string, Vehicle[]>>((acc, v) => {
    (acc[v.vehicle_type] ||= []).push(v);
    return acc;
  }, {});
  const order = ["PESADOS", "OPERACIONAIS", "CESTO_AEREO", "ADMINISTRATIVO", "MUNCK"];
  return (
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

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(14);
    doc.text("Relatório de Checklists", 14, 14);
    doc.setFontSize(9);
    doc.text(`Total: ${stats.total} • Com falhas: ${stats.issues} • Hoje: ${stats.today}`, 14, 20);
    const data = rows();
    autoTable(doc, {
      startY: 25,
      head: [Object.keys(data[0] ?? { Data: "", Placa: "", Tipo: "", Motorista: "", Status: "" })],
      body: data.map((r) => Object.values(r).map((v) => String(v))),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [30, 30, 30] },
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
  const [data, setData] = useState<{ checklist: HistoryRow | null; responses: Array<{ status: string; observation: string | null; checklist_items: { name: string; checklist_categories: { name: string } | null } | null }> }>({ checklist: null, responses: [] });

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
        .select("status, observation, checklist_items(name, checklist_categories(name))")
        .eq("checklist_id", id);
      const merged = ck ? ({ ...(ck as object), profiles: profile } as unknown as HistoryRow) : null;
      setData({ checklist: merged, responses: (resp ?? []) as never });
    })();
  }, [id]);

  const exportPdf = () => {
    if (!data.checklist) return;
    const c = data.checklist;
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("Checklist", 14, 14);
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
    info.forEach((t, i) => doc.text(t, 14, 22 + i * 6));
    autoTable(doc, {
      startY: 22 + info.length * 6 + 4,
      head: [["Categoria", "Item", "Status", "Observação"]],
      body: data.responses.map((r) => [
        r.checklist_items?.checklist_categories?.name ?? "",
        r.checklist_items?.name ?? "",
        r.status,
        r.observation ?? "",
      ]),
      styles: { fontSize: 8 },
    });
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
type Resp = { status: "OK" | "NAO_OK" | "NA" | null; observation: string };

function ChecklistRunner({ vehicleId, onClose }: { vehicleId: string; onClose: () => void }) {
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
        (it ?? []).forEach((x) => { init[x.id] = { status: null, observation: "" }; });
        setResponses(init);
      }
    })();
  }, [vehicleId]);

  const setStatus = (itemId: string, status: Resp["status"]) =>
    setResponses((r) => ({ ...r, [itemId]: { ...r[itemId], status } }));
  const setObs = (itemId: string, observation: string) =>
    setResponses((r) => ({ ...r, [itemId]: { ...r[itemId], observation } }));

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

    const rows = items.map((i) => ({
      checklist_id: ck.id, item_id: i.id,
      status: responses[i.id].status as "OK" | "NAO_OK" | "NA",
      observation: responses[i.id].observation || null,
    }));
    const { error: e2 } = await supabase.from("checklist_responses").insert(rows);
    setBusy(false);
    if (e2) return toast.error(e2.message);
    toast.success("Checklist enviado!");
    onClose();
  };

  if (!vehicle) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;

  return (
    <div className="min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={onClose} className="text-sm text-muted-foreground">← Voltar</button>
          <div className="text-right">
            <div className="font-bold">{vehicle.plate}</div>
            <div className="text-[11px] text-muted-foreground">{vehicle.vehicle_type.replace("_", " ")}</div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        <Card className="p-4 space-y-3">
          <div><Label>Itinerário / Destino</Label><Input value={itinerary} onChange={(e) => setItinerary(e.target.value)} /></div>
          <div><Label>Odômetro</Label><Input type="number" value={odometer} onChange={(e) => setOdometer(e.target.value)} /></div>
        </Card>

        {cats.map((cat) => (
          <section key={cat.id} className="space-y-2">
            <h3 className="font-bold text-sm uppercase tracking-wider text-primary">{cat.name}</h3>
            <Card className="divide-y divide-border">
              {items.filter((i) => i.category_id === cat.id).map((it) => {
                const r = responses[it.id] ?? { status: null, observation: "" };
                return (
                  <div key={it.id} className="p-3 space-y-2">
                    <div className="text-sm font-medium">{it.name}</div>
                    <div className="grid grid-cols-3 gap-2">
                      <StatusBtn label="OK" active={r.status === "OK"} variant="ok" onClick={() => setStatus(it.id, "OK")} />
                      <StatusBtn label="Não OK" active={r.status === "NAO_OK"} variant="nok" onClick={() => setStatus(it.id, "NAO_OK")} />
                      <StatusBtn label="N/A" active={r.status === "NA"} variant="na" onClick={() => setStatus(it.id, "NA")} />
                    </div>
                    {r.status === "NAO_OK" && (
                      <Textarea placeholder="Descreva o problema (obrigatório)" value={r.observation}
                        onChange={(e) => setObs(it.id, e.target.value)} rows={2} />
                    )}
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3">
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
