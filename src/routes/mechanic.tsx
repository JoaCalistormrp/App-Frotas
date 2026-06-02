import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Wrench, LogOut, CheckCircle2, Clock, AlertCircle, X as XIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

export const Route = createFileRoute("/mechanic")({ component: MechanicPage });

type Order = {
  id: string; order_number: string; order_type: "SMI" | "SMV"; base_code: string;
  status: "pendente" | "em_manutencao" | "solucionado";
  failure_description: string | null; service_type: string | null; workshop: string | null;
  solution_description: string | null; items_replaced: string | null;
  km_atual: number | null; validade_oleo: string | null; mod_carro: string | null;
  data_entrada: string | null; hora_entrada: string | null;
  data_saida: string | null; hora_saida: string | null;
  maintenance_category: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  profiles?: { full_name: string | null } | null;
};

function MechanicPage() {
  const { user, loading, isMechanic, isAdmin, signOut } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [statusFilter, setStatusFilter] = useState<"abertos" | "pendente" | "em_manutencao" | "solucionado" | "todos">("abertos");
  const [editing, setEditing] = useState<Order | null>(null);

  const load = async () => {
    let q = supabase
      .from("maintenance_orders")
      .select("*, vehicles(plate, model)")
      .order("created_at", { ascending: false });
    if (statusFilter === "abertos") q = q.in("status", ["pendente", "em_manutencao"]);
    else if (statusFilter !== "todos") q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (error) { toast.error(error.message); return; }
    const rows = (data ?? []) as unknown as Order[];
    const driverIds = Array.from(new Set(rows.map((r) => (r as { driver_id?: string | null }).driver_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (driverIds.length) {
      const { data: profs } = await supabase.from("drivers_directory").select("id, full_name").in("id", driverIds);
      nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setOrders(rows.map((r) => ({ ...r, profiles: { full_name: nameById[(r as { driver_id?: string | null }).driver_id ?? ""] ?? null } })));
  };
  useEffect(() => { if (user && (isMechanic || isAdmin)) load(); /* eslint-disable-next-line */ }, [user, isMechanic, isAdmin, statusFilter]);

  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/" />;
  if (!isMechanic && !isAdmin) return <Navigate to="/" />;

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
        <Card className="p-3 flex gap-2 flex-wrap">
          {([
            ["abertos", "Em aberto", AlertCircle],
            ["pendente", "Pendentes", Clock],
            ["em_manutencao", "Em manutenção", Wrench],
            ["solucionado", "Solucionados", CheckCircle2],
            ["todos", "Todos", Clock],
          ] as const).map(([v, l, Icon]) => (
            <Button key={v} size="sm" variant={statusFilter === v ? "default" : "outline"} onClick={() => setStatusFilter(v)}>
              <Icon className="size-3" />{l}
            </Button>
          ))}
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
      </main>

      {editing && <OrderModal order={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      <footer className="border-t border-border bg-card px-4 py-2 text-center text-[11px] text-muted-foreground">
        Desenvolvido por Julia Ramos
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: Order["status"] }) {
  const map = {
    pendente: { l: "Pendente", c: "bg-amber-500/10 text-amber-600" },
    em_manutencao: { l: "Em manutenção", c: "bg-blue-500/10 text-blue-600" },
    solucionado: { l: "Solucionado", c: "bg-green-500/10 text-green-600" },
  } as const;
  const s = map[status];
  return <span className={`text-[10px] uppercase px-2 py-0.5 rounded ${s.c}`}>{s.l}</span>;
}

function OrderModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [solution, setSolution] = useState(order.solution_description ?? "");
  const [items, setItems] = useState(order.items_replaced ?? "");
  const [km, setKm] = useState(order.km_atual?.toString() ?? "");
  const [oleo, setOleo] = useState(order.validade_oleo ?? "");
  const [dataSaida, setDataSaida] = useState(order.data_saida ?? "");
  const [horaSaida, setHoraSaida] = useState(order.hora_saida ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        status, solution_description: solution || null, items_replaced: items || null,
        km_atual: km ? Number(km) : null, validade_oleo: oleo || null,
        data_saida: dataSaida || null, hora_saida: horaSaida || null,
        ...(status === "solucionado" ? { signed_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase.from("maintenance_orders").update(payload).eq("id", order.id);
      if (error) throw error;
      toast.success("Atualizada");
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
        {order.failure_description && (
          <div><Label className="text-xs">Falha relatada</Label><div className="text-sm p-2 bg-muted rounded">{order.failure_description}</div></div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div><Label className="text-xs">Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="pendente">Pendente</option>
              <option value="em_manutencao">Em manutenção</option>
              <option value="solucionado">Solucionado (baixa)</option>
            </select>
          </div>
          <div><Label className="text-xs">KM atual</Label><Input value={km} onChange={(e) => setKm(e.target.value)} type="number" /></div>
          <div><Label className="text-xs">Validade do óleo</Label><Input value={oleo} onChange={(e) => setOleo(e.target.value)} placeholder="KM ou data" /></div>
          <div><Label className="text-xs">Data saída</Label><Input type="date" value={dataSaida} onChange={(e) => setDataSaida(e.target.value)} /></div>
          <div><Label className="text-xs">Hora saída</Label><Input type="time" value={horaSaida} onChange={(e) => setHoraSaida(e.target.value)} /></div>
        </div>
        <div><Label className="text-xs">Descrição da solução</Label><Textarea rows={4} value={solution} onChange={(e) => setSolution(e.target.value)} /></div>
        <div><Label className="text-xs">Itens trocados</Label><Textarea rows={3} value={items} onChange={(e) => setItems(e.target.value)} /></div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? "..." : status === "solucionado" ? "Dar baixa" : "Salvar"}</Button>
        </div>
      </Card>
    </div>
  );
}