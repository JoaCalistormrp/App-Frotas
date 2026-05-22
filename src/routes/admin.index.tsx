import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { ClipboardList, Truck, Users, Wrench, AlertTriangle, CheckCircle2, Bell, FileText } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type DriverRow = { id: string; full_name: string | null; cnh: string | null; cnh_expires_at: string | null };
type Ck = { id: string; created_at: string; has_issues: boolean; vehicles: { plate: string } | null; driver_id: string };

function daysUntil(d: string | null): number | null {
  if (!d) return null;
  const x = new Date(d + "T00:00:00"); const t = new Date(); t.setHours(0,0,0,0);
  return Math.floor((x.getTime() - t.getTime()) / 86400000);
}

const cards = [
  { to: "/admin/checklists", title: "Histórico Geral", desc: "Todos os checklists", icon: ClipboardList, color: "text-blue-500" },
  { to: "/admin/vehicles", title: "Veículos", desc: "Cadastro e documentos", icon: Truck, color: "text-green-500" },
  { to: "/admin/drivers", title: "Motoristas", desc: "CNH, função e cartão", icon: Users, color: "text-amber-500" },
  { to: "/admin/maintenance", title: "SMV / SMI", desc: "Ordens de manutenção", icon: Wrench, color: "text-rose-500" },
];

function AdminDashboard() {
  const [todayCks, setTodayCks] = useState<Ck[]>([]);
  const [issuesToday, setIssuesToday] = useState<Ck[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [stats, setStats] = useState({ vehicles: 0, drivers: 0, openOrders: 0 });
  const [driverNames, setDriverNames] = useState<Record<string, string>>({});

  useEffect(() => { (async () => {
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
    const { data: cks } = await supabase.from("checklists")
      .select("id, created_at, has_issues, driver_id, vehicles(plate)")
      .gte("created_at", startOfDay.toISOString())
      .order("created_at", { ascending: false });
    const arr = (cks ?? []) as unknown as Ck[];
    setTodayCks(arr);
    setIssuesToday(arr.filter((c) => c.has_issues));
    const ids = Array.from(new Set(arr.map((c) => c.driver_id).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      setDriverNames(Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "—"])));
    }
    const { data: ds } = await supabase.from("profiles").select("id, full_name, cnh, cnh_expires_at").not("cnh_expires_at", "is", null);
    setDrivers((ds ?? []) as DriverRow[]);
    const [{ count: vc }, { count: dc }, { count: oc }] = await Promise.all([
      supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("active", true),
      supabase.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "driver"),
      (supabase.from as never as (t: string) => { select: (s: string, o: { count: "exact"; head: boolean }) => { neq: (c: string, v: string) => Promise<{ count: number | null }> } })("maintenance_orders").select("*", { count: "exact", head: true }).neq("status", "solucionado"),
    ]);
    setStats({ vehicles: vc ?? 0, drivers: dc ?? 0, openOrders: oc ?? 0 });
  })(); }, []);

  const expired = drivers.filter((d) => (daysUntil(d.cnh_expires_at) ?? 999) < 0);
  const expiring = drivers.filter((d) => { const x = daysUntil(d.cnh_expires_at); return x !== null && x >= 0 && x <= 30; });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Visão geral da frota</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Checklists hoje</div><div className="text-3xl font-bold">{todayCks.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Falhas hoje</div><div className="text-3xl font-bold text-destructive">{issuesToday.length}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Veículos ativos</div><div className="text-3xl font-bold">{stats.vehicles}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">SMV/SMI abertas</div><div className="text-3xl font-bold text-amber-600">{stats.openOrders}</div></Card>
      </div>

      {/* Quick nav cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="block">
            <Card className="p-5 hover:border-primary transition cursor-pointer h-full">
              <c.icon className={`size-8 ${c.color} mb-3`} />
              <div className="font-bold">{c.title}</div>
              <div className="text-xs text-muted-foreground">{c.desc}</div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Alerts + lists */}
      <div className="grid md:grid-cols-2 gap-3">
        <Card className="p-4 border-l-4 border-l-destructive">
          <div className="flex items-center gap-2 font-semibold mb-3"><Bell className="size-4 text-destructive" />Alertas de CNH</div>
          {expired.length === 0 && expiring.length === 0 && <div className="text-sm text-muted-foreground">Nenhum alerta.</div>}
          {expired.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-bold text-destructive mb-1">Vencidas ({expired.length})</div>
              <ul className="text-xs space-y-1">
                {expired.slice(0, 5).map((d) => <li key={d.id} className="flex justify-between"><span className="truncate">{d.full_name ?? "—"}</span><span className="text-destructive">{Math.abs(daysUntil(d.cnh_expires_at)!)}d</span></li>)}
              </ul>
            </div>
          )}
          {expiring.length > 0 && (
            <div>
              <div className="text-xs font-bold text-amber-600 mb-1">A vencer em 30 dias ({expiring.length})</div>
              <ul className="text-xs space-y-1">
                {expiring.slice(0, 5).map((d) => <li key={d.id} className="flex justify-between"><span className="truncate">{d.full_name ?? "—"}</span><span className="text-amber-600">{daysUntil(d.cnh_expires_at)}d</span></li>)}
              </ul>
            </div>
          )}
          <Link to="/admin/drivers" className="text-xs text-primary mt-3 inline-block">Ver todos os motoristas →</Link>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 font-semibold mb-3"><AlertTriangle className="size-4 text-amber-600" />Falhas identificadas hoje</div>
          {issuesToday.length === 0
            ? <div className="text-sm text-muted-foreground">Nenhuma falha registrada hoje.</div>
            : (
              <ul className="text-sm space-y-2">
                {issuesToday.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2 border-b border-border pb-2">
                    <div className="min-w-0">
                      <div className="font-bold truncate">{c.vehicles?.plate ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{driverNames[c.driver_id] ?? "—"}</div>
                    </div>
                    <span className="text-xs text-destructive shrink-0">{new Date(c.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            )
          }
          <Link to="/admin/checklists" className="text-xs text-primary mt-3 inline-block">Ver histórico completo →</Link>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 font-semibold mb-3"><FileText className="size-4" />Checklists realizados hoje ({todayCks.length})</div>
        {todayCks.length === 0
          ? <div className="text-sm text-muted-foreground">Nenhum checklist hoje.</div>
          : (
            <div className="divide-y divide-border">
              {todayCks.slice(0, 10).map((c) => (
                <div key={c.id} className="py-2 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <div className="font-bold truncate">{c.vehicles?.plate ?? "—"} <span className="text-xs font-normal text-muted-foreground">• {driverNames[c.driver_id] ?? "—"}</span></div>
                    <div className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleTimeString("pt-BR")}</div>
                  </div>
                  {c.has_issues
                    ? <span className="text-destructive flex items-center gap-1 text-xs"><AlertTriangle className="size-3" />Falhas</span>
                    : <span className="text-green-600 flex items-center gap-1 text-xs"><CheckCircle2 className="size-3" />OK</span>}
                </div>
              ))}
            </div>
          )
        }
      </Card>
    </div>
  );
}