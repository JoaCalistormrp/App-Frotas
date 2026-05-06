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
import { LogOut, Truck, CheckCircle2, XCircle, MinusCircle, AlertTriangle } from "lucide-react";

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
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = mode === "in" ? await signIn(email, password) : await signUp(email, password, name);
    setBusy(false);
    if (r.error) toast.error(r.error);
    else if (mode === "up") toast.success("Conta criada! Você já pode entrar.");
  };

  return (
    <div className="min-h-screen grid place-items-center p-4 bg-background">
      <Card className="w-full max-w-md p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl bg-primary grid place-items-center text-primary-foreground"><Truck className="size-6" /></div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Checklist Frota</h1>
            <p className="text-xs text-muted-foreground">Inspeção veicular digital</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "up" && (
            <div><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          )}
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} /></div>
          <Button type="submit" className="w-full h-11 text-base" disabled={busy}>
            {busy ? "..." : mode === "in" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="text-sm text-primary w-full">
          {mode === "in" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
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
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-lg bg-primary grid place-items-center text-primary-foreground"><Truck className="size-5" /></div>
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
          <div className="grid gap-2">
            {vehicles.map((v) => (
              <button key={v.id} onClick={() => setActiveChecklist(v.id)}
                className="text-left p-4 rounded-xl bg-card border border-border hover:border-primary transition flex items-center justify-between">
                <div>
                  <div className="font-bold tracking-wide">{v.plate}</div>
                  <div className="text-xs text-muted-foreground">{v.model || "—"} • {v.vehicle_type.replace("_", " ")}{v.base ? ` • ${v.base}` : ""}</div>
                </div>
                <div className="text-primary text-sm font-semibold">Iniciar →</div>
              </button>
            ))}
          </div>
        </section>

        {isAdmin && <AdminPanel onChange={load} />}
      </main>

      {showAddVehicle && <AddVehicleModal onClose={() => { setShowAddVehicle(false); load(); }} />}
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

function AdminPanel({ onChange: _ }: { onChange: () => void }) {
  const [stats, setStats] = useState({ total: 0, issues: 0, today: 0 });
  const [recent, setRecent] = useState<Array<{ id: string; created_at: string; has_issues: boolean; vehicles: { plate: string } | null }>>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("checklists")
        .select("id, created_at, has_issues, vehicles(plate)")
        .order("created_at", { ascending: false }).limit(20);
      const list = (data ?? []) as never as typeof recent;
      setRecent(list);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      setStats({
        total: list.length,
        issues: list.filter((c) => c.has_issues).length,
        today: list.filter((c) => new Date(c.created_at) >= today).length,
      });
    })();
  }, []);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">Painel admin</h2>
      <div className="grid grid-cols-3 gap-2">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Hoje</div><div className="text-2xl font-bold">{stats.today}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Recentes</div><div className="text-2xl font-bold">{stats.total}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Com falhas</div><div className="text-2xl font-bold text-destructive">{stats.issues}</div></Card>
      </div>
      <Card className="p-3">
        <div className="font-semibold text-sm mb-2">Últimos checklists</div>
        {recent.length === 0 && <div className="text-xs text-muted-foreground">Nenhum ainda.</div>}
        <div className="divide-y divide-border">
          {recent.map((c) => (
            <div key={c.id} className="py-2 flex items-center justify-between text-sm">
              <div>
                <div className="font-bold">{c.vehicles?.plate ?? "—"}</div>
                <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</div>
              </div>
              {c.has_issues
                ? <span className="text-destructive flex items-center gap-1 text-xs"><AlertTriangle className="size-4" />Com falhas</span>
                : <span className="text-[color:var(--success)] flex items-center gap-1 text-xs"><CheckCircle2 className="size-4" />OK</span>}
            </div>
          ))}
        </div>
      </Card>
    </section>
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
}
