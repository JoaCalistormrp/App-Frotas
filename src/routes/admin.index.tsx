import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle, Bell, CalendarDays, ChartColumn, CheckCircle2, ClipboardCheck, Clock, Droplets, FilePlus, IdCard,
  Info, Plus, RefreshCw, Table2, Truck, Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { canAccessPage, prettyName } from "@/lib/nav";
import { OPEN_STATUSES, type MaintenanceStatus } from "@/lib/maintenance";
import { StatusBadge } from "@/components/maintenance-ui";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

type TodayCk = {
  id: string; created_at: string; has_issues: boolean; driver_id: string; vehicle_id: string;
  vehicles: { plate: string | null; model: string | null } | null;
};
type DayPoint = { key: string; date: Date; total: number; failures: number };
type Person = { id: string; full_name: string | null; cnh_expires_at: string };
type OilVehicle = { id: string; plate: string; mileage: number | null; oil_change_due_km: number | null };
type Schedule = { id: string; vehicle_id: string | null; type: string; title: string | null; start_date: string; end_date: string; start_time: string | null };
type LinkedOs = { id: string; order_number: string; status: MaintenanceStatus };

type DashData = {
  today: TodayCk[];
  driverNames: Record<string, string>;
  days: DayPoint[];
  activeVehicles: number;
  openOs: number;
  awaiting: number;
  osByChecklist: Record<string, LinkedOs>;
  pendingFailures: number;
  cnhExpired: Person[];
  cnhSoon: Person[];
  cnhMissing: number;
  oilConfigured: number;
  oilOverdue: OilVehicle[];
  schedules: Schedule[];
  plateById: Record<string, string>;
  loadedAt: Date;
};

const pad = (n: number) => String(n).padStart(2, "0");
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const parseLocalDate = (s: string) => new Date(`${s}T00:00:00`);

function daysUntil(d: string): number {
  return Math.round((parseLocalDate(d).getTime() - startOfToday().getTime()) / 86_400_000);
}

const FMT_LONG = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" });
const FMT_WEEKDAY = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
const FMT_ROW = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
const FMT_MONTH = new Intl.DateTimeFormat("pt-BR", { month: "short" });
const FMT_TIME = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Mesma janela da tela de Manutenção, para os números baterem entre as telas
const FAILURE_WINDOW_DAYS = 30;

async function loadDashboard(): Promise<DashData> {
  const today = startOfToday();
  const seriesStart = addDays(today, -13);
  const failuresSince = new Date(Date.now() - FAILURE_WINDOW_DAYS * 864e5).toISOString();

  const [todayRes, seriesRes, vehiclesRes, oilRes, ordersRes, failRes, cnhRes, missingRes, schedRes] = await Promise.all([
    supabase.from("checklists").select("id, created_at, has_issues, driver_id, vehicle_id, vehicles(plate, model)")
      .gte("created_at", today.toISOString()).order("created_at", { ascending: false }).limit(500),
    supabase.from("checklists").select("created_at, has_issues").gte("created_at", seriesStart.toISOString()).limit(5000),
    supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("vehicles").select("id, plate, mileage, oil_change_due_km").eq("active", true).not("oil_change_due_km", "is", null),
    supabase.from("maintenance_orders").select("id, order_number, status, checklist_id").is("deleted_at", null).limit(2000),
    supabase.from("checklists").select("id").eq("has_issues", true).gte("created_at", failuresSince).limit(1000),
    supabase.from("profiles").select("id, full_name, cnh_expires_at").not("cnh_expires_at", "is", null),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("driver_active", true).is("cnh_expires_at", null),
    supabase.from("vehicle_schedules").select("id, vehicle_id, type, title, start_date, end_date, start_time")
      .gte("end_date", dayKey(today)).lte("start_date", dayKey(addDays(today, 7))).order("start_date").limit(20),
  ]);

  const todayCks = (todayRes.data ?? []) as unknown as TodayCk[];

  const byDay = new Map<string, DayPoint>();
  for (let i = 0; i < 14; i++) {
    const date = addDays(seriesStart, i);
    byDay.set(dayKey(date), { key: dayKey(date), date, total: 0, failures: 0 });
  }
  for (const c of (seriesRes.data ?? []) as Array<{ created_at: string; has_issues: boolean }>) {
    const p = byDay.get(dayKey(new Date(c.created_at)));
    if (p) { p.total++; if (c.has_issues) p.failures++; }
  }

  const orders = (ordersRes.data ?? []) as Array<LinkedOs & { checklist_id: string | null }>;
  const osByChecklist: Record<string, LinkedOs> = {};
  for (const o of orders) if (o.checklist_id) osByChecklist[o.checklist_id] = { id: o.id, order_number: o.order_number, status: o.status };

  const people = (cnhRes.data ?? []) as Person[];
  const oil = (oilRes.data ?? []) as OilVehicle[];
  const schedules = (schedRes.data ?? []) as Schedule[];

  const driverIds = Array.from(new Set(todayCks.map((c) => c.driver_id).filter(Boolean)));
  const schedVehicleIds = Array.from(new Set(schedules.map((s) => s.vehicle_id).filter(Boolean) as string[]));
  const [namesRes, platesRes] = await Promise.all([
    driverIds.length ? supabase.from("profiles").select("id, full_name").in("id", driverIds) : Promise.resolve({ data: [] }),
    schedVehicleIds.length ? supabase.from("vehicles").select("id, plate").in("id", schedVehicleIds) : Promise.resolve({ data: [] }),
  ]);

  return {
    today: todayCks,
    driverNames: Object.fromEntries(((namesRes.data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, prettyName(p.full_name) ?? "—"])),
    days: Array.from(byDay.values()),
    activeVehicles: vehiclesRes.count ?? 0,
    openOs: orders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
    awaiting: orders.filter((o) => o.status === "aguardando_aprovacao").length,
    osByChecklist,
    pendingFailures: ((failRes.data ?? []) as Array<{ id: string }>).filter((c) => !osByChecklist[c.id]).length,
    cnhExpired: people.filter((p) => daysUntil(p.cnh_expires_at) < 0).sort((a, b) => a.cnh_expires_at.localeCompare(b.cnh_expires_at)),
    cnhSoon: people.filter((p) => { const d = daysUntil(p.cnh_expires_at); return d >= 0 && d <= 30; })
      .sort((a, b) => a.cnh_expires_at.localeCompare(b.cnh_expires_at)),
    cnhMissing: missingRes.count ?? 0,
    oilConfigured: oil.length,
    oilOverdue: oil.filter((v) => v.mileage != null && v.oil_change_due_km != null && v.mileage >= v.oil_change_due_km),
    schedules,
    plateById: Object.fromEntries(((platesRes.data ?? []) as Array<{ id: string; plate: string }>).map((v) => [v.id, v.plate])),
    loadedAt: new Date(),
  };
}

// ---------------- Peças de interface ----------------

type Tone = "critical" | "warning";
const TONE_TEXT: Record<Tone, string> = {
  critical: "text-destructive",
  warning: "text-amber-700 dark:text-amber-400",
};
const TONE_ICON: Record<Tone, string> = {
  critical: `bg-destructive/10 ${TONE_TEXT.critical}`,
  warning: `bg-amber-500/15 ${TONE_TEXT.warning}`,
};

type Cta = { label: string; to: string; search?: Record<string, string>; params?: Record<string, string> };
type AttentionItem = { key: string; tone: Tone; icon: ComponentType<{ className?: string }>; title: string; text: string; cta?: Cta };
type InfoItem = { key: string; text: string; cta?: Cta };

function CtaLink({ cta, className, children }: { cta: Cta; className?: string; children: ReactNode }) {
  return (
    <Link to={cta.to as never} params={cta.params as never} search={cta.search as never} className={className}>
      {children}
    </Link>
  );
}

function SectionTitle({ icon: Icon, children, aside }: { icon: ComponentType<{ className?: string }>; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4 text-primary" />{children}</h2>
      {aside}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="h-1.5 w-full overflow-hidden rounded-full bg-[#cde2fb] dark:bg-[#184f95]"
    >
      <div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatTile({ label, value, suffix, hint, icon: Icon, tone, to, search, meter }: {
  label: string; value: number | string; suffix?: string; hint?: string; icon: ComponentType<{ className?: string }>;
  tone?: Tone; to?: string; search?: Record<string, string>; meter?: { value: number; label: string };
}) {
  const body = (
    <Card className={cn("h-full space-y-2 p-4 transition-colors", to && "group-hover:border-primary/40 group-hover:bg-muted/20")}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Icon className={cn("size-4 shrink-0", tone ? TONE_TEXT[tone] : "text-muted-foreground")} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold leading-none">{value}</span>
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
      {meter && <Meter value={meter.value} label={meter.label} />}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
  if (!to) return body;
  return (
    <Link to={to as never} search={search as never} className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {body}
    </Link>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">{children}</p>;
}

// ---------------- Gráfico de checklists por dia ----------------

const PLOT_H = 168;

function niceScale(max: number) {
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top; t += step) ticks.push(t);
  return { top, ticks };
}

function DailyChart({ days }: { days: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const { top, ticks } = niceScale(Math.max(1, ...days.map((d) => d.total)));
  const y = (v: number) => (v / top) * PLOT_H;
  const last = days.length - 1;
  const a = active !== null ? days[active] : null;
  const shift = active === null ? "-50%" : active < 2 ? "-20%" : active > last - 2 ? "-80%" : "-50%";

  return (
    <div className="flex gap-2">
      <div className="relative w-6 shrink-0" style={{ height: PLOT_H }} aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: PLOT_H - y(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div key={t} aria-hidden className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-border" : "bg-border/50")} style={{ top: PLOT_H - y(t) }} />
          ))}
          <ul className="absolute inset-0 flex items-end" aria-label="Checklists por dia, últimos 14 dias">
            {days.map((d, i) => {
              const ok = d.total - d.failures;
              const failH = d.failures ? Math.max(y(d.failures), 3) : 0;
              const okH = ok ? Math.max(y(ok) - (d.failures ? 2 : 0), 3) : 0;
              return (
                <li key={d.key} className="flex h-full flex-1">
                  <button
                    type="button"
                    aria-label={`${FMT_LONG.format(d.date)}: ${plural(d.total, "checklist", "checklists")}, ${d.failures} com falha`}
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    className={cn(
                      "flex h-full w-full items-end justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      active === i && "bg-muted/60",
                    )}
                  >
                    <span className="flex w-[62%] max-w-6 flex-col-reverse gap-[2px]">
                      {failH > 0 && <span className="block bg-destructive" style={{ height: failH, borderRadius: okH ? 0 : "4px 4px 0 0" }} />}
                      {okH > 0 && <span className="block bg-[#c3c2b7] dark:bg-[#898781]" style={{ height: okH, borderRadius: "4px 4px 0 0" }} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {a && (
            <div
              role="tooltip"
              className="pointer-events-none absolute top-0 z-10 w-max rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
              style={{ left: `${((active! + 0.5) / days.length) * 100}%`, transform: `translateX(${shift})` }}
            >
              <div className="mb-1 font-medium text-muted-foreground first-letter:uppercase">{FMT_LONG.format(a.date)}</div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded-full bg-destructive" aria-hidden />
                <strong className="tabular-nums">{a.failures}</strong><span className="text-muted-foreground">com falha</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded-full bg-[#c3c2b7] dark:bg-[#898781]" aria-hidden />
                <strong className="tabular-nums">{a.total - a.failures}</strong><span className="text-muted-foreground">sem falha</span>
              </div>
              <div className="mt-1 border-t border-border pt-1 text-muted-foreground">
                <strong className="tabular-nums text-foreground">{a.total}</strong> no total
              </div>
            </div>
          )}
        </div>
        <div className="mt-1.5 flex" aria-hidden>
          {days.map((d, i) => (
            <span
              key={d.key}
              className={cn(
                "flex-1 text-center text-[10px] leading-tight text-muted-foreground",
                i === last && "font-semibold text-foreground",
                i % 2 === 0 && i !== last && "max-sm:invisible",
              )}
            >
              {i === last ? "Hoje" : d.date.getDate()}
              <span className="block text-[9px]">{i === last ? " " : FMT_WEEKDAY.format(d.date).replace(".", "")}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function DailyTable({ days }: { days: DayPoint[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <caption className="sr-only">Checklists por dia nos últimos 14 dias</caption>
        <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">Dia</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Total</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Com falha</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Sem falha</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {[...days].reverse().map((d) => (
            <tr key={d.key}>
              <th scope="row" className="px-3 py-1.5 text-left font-normal first-letter:uppercase">{FMT_ROW.format(d.date)}</th>
              <td className="px-3 py-1.5 text-right tabular-nums">{d.total}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{d.failures}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{d.total - d.failures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpiryGroup({ title, tone, items, more }: {
  title: string; tone: Tone; items: Array<{ key: string; label: string; value: string; cta?: Cta }>; more: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <span className={cn("grid size-5 place-items-center rounded-full", TONE_ICON[tone])}>
          {tone === "critical" ? <AlertTriangle className="size-3" /> : <Clock className="size-3" />}
        </span>
        {title}
        <span className="font-normal text-muted-foreground">({items.length + more})</span>
      </div>
      <ul className="space-y-1 pl-7">
        {items.map((it) => (
          <li key={it.key} className="flex items-center justify-between gap-2 text-sm">
            {it.cta
              ? <CtaLink cta={it.cta} className="truncate hover:text-primary hover:underline">{it.label}</CtaLink>
              : <span className="truncate">{it.label}</span>}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{it.value}</span>
          </li>
        ))}
        {more > 0 && <li className="text-xs text-muted-foreground">e mais {more}</li>}
      </ul>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-28 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

// ---------------- Página ----------------

function AdminDashboard() {
  const { isMaster, modules } = useAuth();
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const can = (slug: string) => canAccessPage(modules, slug);
  const canMaintain = can("frotas.manutencao");
  const canChecklist = can("frotas.checklist_new");
  const canHistory = can("frotas.checklists");
  const canDrivers = can("frotas.motoristas");
  const canVehicles = can("frotas.veiculos");
  const canAgenda = can("frotas.agendamento");

  const reload = useCallback(async () => {
    setLoading(true);
    try { setData(await loadDashboard()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">Dashboard da frota</h1>
        <p className="text-sm text-muted-foreground first-letter:uppercase">
          {FMT_LONG.format(new Date())}
          {data && ` · atualizado às ${FMT_TIME.format(data.loadedAt)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={cn(loading && "animate-spin")} />Atualizar
        </Button>
        {canChecklist && (
          <Button asChild variant="outline" size="sm"><Link to="/admin/checklist"><FilePlus />Abrir checklist</Link></Button>
        )}
        {canMaintain && (
          <Button asChild size="sm"><Link to="/admin/maintenance/$id" params={{ id: "new" }}><Plus />Nova OS</Link></Button>
        )}
      </div>
    </div>
  );

  if (!data) {
    return <div className="mx-auto max-w-7xl space-y-6">{header}<DashboardSkeleton /></div>;
  }

  const todayFailures = data.today.filter((c) => c.has_issues).length;
  const vehiclesToday = new Set(data.today.map((c) => c.vehicle_id).filter(Boolean)).size;
  const coverage = data.activeVehicles ? vehiclesToday / data.activeVehicles : 0;
  const previous7 = data.days.slice(-8, -1);
  const avg7 = previous7.reduce((n, d) => n + d.total, 0) / Math.max(previous7.length, 1);
  const total14 = data.days.reduce((n, d) => n + d.total, 0);
  const fails14 = data.days.reduce((n, d) => n + d.failures, 0);

  const attention: AttentionItem[] = [];
  if (data.pendingFailures > 0) {
    attention.push({
      key: "falhas", tone: "critical", icon: AlertTriangle,
      title: `${plural(data.pendingFailures, "falha de checklist", "falhas de checklist")} sem OS`,
      text: `Registradas nos últimos ${FAILURE_WINDOW_DAYS} dias e ainda sem ordem de serviço`,
      cta: canMaintain ? { label: "Ver falhas", to: "/admin/maintenance", search: { aba: "falhas" } } : undefined,
    });
  }
  if (data.awaiting > 0) {
    attention.push({
      key: "aprovacao", tone: "warning", icon: Clock,
      title: `${plural(data.awaiting, "OS aguardando", "OS aguardando")} ${isMaster ? "sua aprovação" : "aprovação"}`,
      text: isMaster ? "Revise o orçamento e aprove ou negue" : "Aguardando decisão de um usuário Master",
      cta: canMaintain ? { label: "Revisar", to: "/admin/maintenance", search: { filtro: "aprovacao" } } : undefined,
    });
  }
  if (data.cnhExpired.length > 0) {
    attention.push({
      key: "cnh-vencida", tone: "critical", icon: IdCard,
      title: `${plural(data.cnhExpired.length, "CNH vencida", "CNHs vencidas")}`,
      text: data.cnhExpired.slice(0, 3).map((p) => prettyName(p.full_name)).filter(Boolean).join(", ") + (data.cnhExpired.length > 3 ? "…" : ""),
      cta: canDrivers ? { label: "Ver motoristas", to: "/admin/drivers" } : undefined,
    });
  }
  if (data.cnhSoon.length > 0) {
    attention.push({
      key: "cnh-30", tone: "warning", icon: IdCard,
      title: `${plural(data.cnhSoon.length, "CNH vence", "CNHs vencem")} em até 30 dias`,
      text: data.cnhSoon.slice(0, 3).map((p) => `${prettyName(p.full_name)} (${daysUntil(p.cnh_expires_at)} d)`).join(", "),
      cta: canDrivers ? { label: "Ver motoristas", to: "/admin/drivers" } : undefined,
    });
  }
  if (data.oilOverdue.length > 0) {
    attention.push({
      key: "oleo", tone: "critical", icon: Droplets,
      title: `${plural(data.oilOverdue.length, "troca de óleo vencida", "trocas de óleo vencidas")}`,
      text: data.oilOverdue.slice(0, 4).map((v) => v.plate).join(", "),
      cta: canVehicles ? { label: "Ver veículos", to: "/admin/vehicles" } : undefined,
    });
  }

  // O que o sistema não consegue avisar porque falta cadastro
  const infos: InfoItem[] = [];
  if (data.cnhMissing > 0) {
    infos.push({
      key: "cnh-sem-data",
      text: `${plural(data.cnhMissing, "motorista ativo está", "motoristas ativos estão")} sem validade de CNH cadastrada, por isso ficam fora dos alertas.`,
      cta: canDrivers ? { label: "Completar cadastro", to: "/admin/drivers" } : undefined,
    });
  }
  if (data.activeVehicles > 0 && data.oilConfigured === 0) {
    infos.push({
      key: "oleo-sem-config",
      text: "Nenhum veículo tem a próxima troca de óleo programada, então não há alerta de óleo.",
      cta: canVehicles ? { label: "Programar", to: "/admin/vehicles" } : undefined,
    });
  }

  const todaySorted = [...data.today].sort((x, z) => Number(z.has_issues) - Number(x.has_issues) || z.created_at.localeCompare(x.created_at));
  const expiryEmpty = !data.cnhExpired.length && !data.cnhSoon.length && !data.oilOverdue.length;

  return (
    <div className={cn("mx-auto max-w-7xl space-y-6 transition-opacity", loading && "opacity-60")}>
      {header}

      {/* 1. O que pede ação agora */}
      <Card className="overflow-hidden">
        <div className="px-4 pb-2 pt-4">
          <SectionTitle icon={Bell} aside={attention.length > 0 && <span className="text-xs text-muted-foreground">{plural(attention.length, "pendência", "pendências")}</span>}>
            Precisa de atenção
          </SectionTitle>
        </div>
        {attention.length === 0 ? (
          <div className="flex items-center gap-3 px-4 pb-4">
            <span className="grid size-9 place-items-center rounded-full bg-green-500/10 text-green-600"><CheckCircle2 className="size-4" /></span>
            <div>
              <div className="text-sm font-medium">Tudo em dia</div>
              <div className="text-xs text-muted-foreground">Nenhuma pendência na frota agora.</div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {attention.map((it) => (
              <li key={it.key} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONE_ICON[it.tone])}><it.icon className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{it.title}</div>
                  {it.text && <div className="truncate text-xs text-muted-foreground">{it.text}</div>}
                </div>
                {it.cta && (
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <CtaLink cta={it.cta}>{it.cta.label}</CtaLink>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {infos.length > 0 && (
          <div className="space-y-2 border-t border-border bg-muted/30 px-4 py-3">
            {infos.map((i) => (
              <div key={i.key} className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span className="flex-1">{i.text}</span>
                {i.cta && <CtaLink cta={i.cta} className="shrink-0 font-medium text-primary hover:underline">{i.cta.label}</CtaLink>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 2. Números do dia */}
      <section aria-label="Números de hoje" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Checklists hoje"
          value={data.today.length}
          hint={`Média dos 7 dias anteriores: ${avg7.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`}
          icon={ClipboardCheck}
          to={canHistory ? "/admin/checklists" : undefined}
          search={{ periodo: "hoje" }}
        />
        <StatTile
          label="Veículos verificados hoje"
          value={vehiclesToday}
          suffix={`de ${data.activeVehicles}`}
          hint={`${Math.round(coverage * 100)}% da frota ativa`}
          icon={Truck}
          meter={{ value: coverage, label: "Veículos com checklist hoje em relação à frota ativa" }}
        />
        <StatTile
          label="Checklists com falha hoje"
          value={todayFailures}
          hint={data.today.length ? `${Math.round((todayFailures / data.today.length) * 100)}% dos checklists de hoje` : "Nenhum checklist hoje"}
          icon={AlertTriangle}
          tone={todayFailures > 0 ? "critical" : undefined}
          to={canMaintain && todayFailures > 0 ? "/admin/maintenance" : undefined}
          search={{ aba: "falhas" }}
        />
        <StatTile
          label="OS em aberto"
          value={data.openOs}
          hint={data.awaiting ? `${data.awaiting} aguardando aprovação` : "Nenhuma aguardando aprovação"}
          icon={Wrench}
          to={canMaintain ? "/admin/maintenance" : undefined}
        />
      </section>

      {/* 3. Tendência */}
      <Card className="space-y-3 p-4">
        <SectionTitle
          icon={ChartColumn}
          aside={
            <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
              {showTable ? <><ChartColumn />Ver gráfico</> : <><Table2 />Ver tabela</>}
            </Button>
          }
        >
          Checklists por dia
        </SectionTitle>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Últimos 14 dias · {plural(total14, "checklist", "checklists")}, {fails14} com falha
            {total14 > 0 && ` (${Math.round((fails14 / total14) * 100)}%)`}
          </p>
          {!showTable && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-destructive" aria-hidden />Com falha</span>
              <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[2px] bg-[#c3c2b7] dark:bg-[#898781]" aria-hidden />Sem falha</span>
            </div>
          )}
        </div>
        {showTable ? <DailyTable days={data.days} /> : <DailyChart days={data.days} />}
      </Card>

      {/* 4. Detalhe do dia + vencimentos + agenda */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="space-y-3 p-4 lg:col-span-2">
          <SectionTitle
            icon={ClipboardCheck}
            aside={canHistory && <Link to="/admin/checklists" className="text-xs font-medium text-primary hover:underline">Ver histórico</Link>}
          >
            Checklists de hoje <span className="font-normal text-muted-foreground">({data.today.length})</span>
          </SectionTitle>
          {data.today.length === 0 ? (
            <EmptyLine>Nenhum checklist enviado hoje ainda.</EmptyLine>
          ) : (
            <ul className="divide-y divide-border">
              {todaySorted.slice(0, 8).map((c) => {
                const os = data.osByChecklist[c.id];
                return (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    {c.has_issues
                      ? <AlertTriangle className="size-4 shrink-0 text-destructive" aria-label="Com falha" />
                      : <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-label="Sem falha" />}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">
                        {c.vehicles?.plate ?? "—"}
                        {c.vehicles?.model && <span className="font-normal text-muted-foreground"> · {c.vehicles.model}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {data.driverNames[c.driver_id] ?? "—"} · {FMT_TIME.format(new Date(c.created_at))}
                      </div>
                    </div>
                    {c.has_issues ? (
                      os ? (
                        <Link to="/admin/maintenance/$id" params={{ id: os.id }} className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                          {os.order_number}<StatusBadge status={os.status} />
                        </Link>
                      ) : canMaintain ? (
                        <Button asChild size="sm" variant="outline" className="shrink-0">
                          <Link to="/admin/maintenance/$id" params={{ id: "new" }} search={{ checklist: c.id } as never}>Abrir OS</Link>
                        </Button>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-destructive">Com falha</span>
                      )
                    ) : (
                      <span className="shrink-0 text-xs font-medium text-green-700 dark:text-green-400">OK</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {data.today.length > 8 && (
            <p className="text-xs text-muted-foreground">E mais {data.today.length - 8} hoje — veja todos no histórico.</p>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <SectionTitle
              icon={IdCard}
              aside={canDrivers && <Link to="/admin/drivers" className="text-xs font-medium text-primary hover:underline">Motoristas</Link>}
            >
              Vencimentos
            </SectionTitle>
            {expiryEmpty ? (
              <EmptyLine>Nenhuma CNH vencida ou vencendo nos próximos 30 dias.</EmptyLine>
            ) : (
              <div className="space-y-3">
                {data.cnhExpired.length > 0 && (
                  <ExpiryGroup
                    title="CNH vencida"
                    tone="critical"
                    items={data.cnhExpired.slice(0, 4).map((p) => ({ key: p.id, label: prettyName(p.full_name) ?? "—", value: `há ${Math.abs(daysUntil(p.cnh_expires_at))} d` }))}
                    more={Math.max(0, data.cnhExpired.length - 4)}
                  />
                )}
                {data.cnhSoon.length > 0 && (
                  <ExpiryGroup
                    title="CNH vence em até 30 dias"
                    tone="warning"
                    items={data.cnhSoon.slice(0, 4).map((p) => ({ key: p.id, label: prettyName(p.full_name) ?? "—", value: `em ${daysUntil(p.cnh_expires_at)} d` }))}
                    more={Math.max(0, data.cnhSoon.length - 4)}
                  />
                )}
                {data.oilOverdue.length > 0 && (
                  <ExpiryGroup
                    title="Troca de óleo vencida"
                    tone="critical"
                    items={data.oilOverdue.slice(0, 4).map((v) => ({
                      key: v.id,
                      label: v.plate,
                      value: `+${((v.mileage ?? 0) - (v.oil_change_due_km ?? 0)).toLocaleString("pt-BR")} km`,
                      cta: canMaintain
                        ? { label: v.plate, to: "/admin/maintenance/$id", params: { id: "new" }, search: { vehicle: v.id, reason: `Troca de óleo vencida — KM atual: ${v.mileage}, previsto: ${v.oil_change_due_km}` } }
                        : undefined,
                    }))}
                    more={Math.max(0, data.oilOverdue.length - 4)}
                  />
                )}
              </div>
            )}
          </Card>

          <Card className="space-y-3 p-4">
            <SectionTitle
              icon={CalendarDays}
              aside={canAgenda && <Link to="/admin/agendamento" className="text-xs font-medium text-primary hover:underline">Abrir agenda</Link>}
            >
              Agenda · próximos 7 dias
            </SectionTitle>
            {data.schedules.length === 0 ? (
              <EmptyLine>Nenhum veículo reservado ou em serviço nos próximos 7 dias.</EmptyLine>
            ) : (
              <ul className="space-y-2">
                {data.schedules.slice(0, 5).map((s) => {
                  const start = parseLocalDate(s.start_date);
                  return (
                    <li key={s.id} className="flex items-center gap-3">
                      <span className="grid w-11 shrink-0 place-items-center rounded-lg border border-border py-1 leading-none">
                        <span className="text-base font-semibold">{start.getDate()}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{FMT_MONTH.format(start).replace(".", "")}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {(s.vehicle_id && data.plateById[s.vehicle_id]) || "Veículo"}{s.title ? ` · ${s.title}` : ""}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.type === "servico" ? "Serviço" : "Reserva"}
                          {s.end_date !== s.start_date && ` · até ${parseLocalDate(s.end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`}
                          {s.start_time && ` · ${s.start_time.slice(0, 5)}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
