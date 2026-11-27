import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, getDay,
  addMonths, subMonths, isToday, parseISO, isSameMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Loader2, ChevronLeft, ChevronRight, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
} from "@/lib/schedule.functions";

export const Route = createFileRoute("/admin/agendamento")({ component: AgendamentoPage });

// ── Types ──────────────────────────────────────────────────────────────────────
type Schedule = {
  id: string; vehicle_id: string; vehicle_plate: string; vehicle_model: string | null;
  type: "reserva" | "servico"; title: string; notes: string | null;
  start_date: string; end_date: string;
  start_time: string | null; end_time: string | null;
  assigned_user_id: string | null; assigned_user_name: string | null;
  created_by: string;
};
type Vehicle = { id: string; plate: string; model: string | null };
type Driver  = { id: string; full_name: string | null };

type FormState = {
  vehicle_id: string; type: "reserva" | "servico"; title: string;
  notes: string; start_date: string; end_date: string;
  start_time: string; end_time: string; assigned_user_id: string;
};

const EMPTY_FORM: FormState = {
  vehicle_id: "", type: "reserva", title: "", notes: "",
  start_date: "", end_date: "", start_time: "", end_time: "", assigned_user_id: "",
};

// "08:00:00" (Postgres) → "08:00" (<input type="time">)
function toInputTime(t: string | null): string {
  return t ? t.slice(0, 5) : "";
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const TYPE_STYLE = {
  reserva: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  servico: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};
const TYPE_DOT = {
  reserva: "bg-blue-500",
  servico: "bg-amber-500",
};
const TYPE_LABEL = { reserva: "Reserva", servico: "Serviço" };

function toIsoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function schedulesOnDay(schedules: Schedule[], day: Date): Schedule[] {
  const iso = toIsoDate(day);
  return schedules
    .filter((s) => s.start_date <= iso && s.end_date >= iso)
    .sort((a, b) => (a.start_time ?? "").localeCompare(b.start_time ?? ""));
}

// ── Page ───────────────────────────────────────────────────────────────────────
function AgendamentoPage() {
  const { isAdmin, modules, loading: authLoading, user } = useAuth();

  const canWrite = isAdmin || modules.includes("frotas.agendamento");
  const canRead  = canWrite || modules.includes("frotas.agendamento.readonly");

  const listFn   = useServerFn(listSchedules);
  const createFn = useServerFn(createSchedule);
  const updateFn = useServerFn(updateSchedule);
  const deleteFn = useServerFn(deleteSchedule);

  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [schedules, setSchedules]       = useState<Schedule[]>([]);
  const [vehicles,  setVehicles]        = useState<Vehicle[]>([]);
  const [drivers,   setDrivers]         = useState<Driver[]>([]);
  const [loading,   setLoading]         = useState(false);
  const [saving,    setSaving]          = useState(false);

  // Side sheet: events for selected day
  const [sheetDay, setSheetDay] = useState<Date | null>(null);

  // Form modal
  const [formOpen,    setFormOpen]    = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [form,        setForm]        = useState<FormState>(EMPTY_FORM);
  const [formPreDate, setFormPreDate] = useState<string>("");

  // ── Load static data once ──
  useEffect(() => {
    supabase.from("vehicles").select("id, plate, model").eq("active", true).order("plate")
      .then(({ data }) => setVehicles((data ?? []) as Vehicle[]));
    supabase.from("profiles").select("id, full_name").eq("driver_active", true).order("full_name")
      .then(({ data }) => setDrivers((data ?? []) as Driver[]));
  }, []);

  // ── Load schedules for current month ──
  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listFn({
        data: { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1 },
      });
      if (!Array.isArray(rows)) throw new Error("Não foi possível carregar os agendamentos. Tente novamente.");
      setSchedules(rows as Schedule[]);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Erro ao carregar agendamentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (!authLoading && canRead) load(); }, [currentMonth, authLoading, user]);

  // ── Calendar grid ──
  const monthStart = startOfMonth(currentMonth);
  const monthEnd   = endOfMonth(currentMonth);
  const days       = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Monday-first: getDay returns 0=Sun → shift: (0+6)%7=6, (1+6)%7=0…
  const leadingBlanks = (getDay(monthStart) + 6) % 7;

  const dayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  // ── Form helpers ──
  const openCreate = (preDate?: string) => {
    const today = toIsoDate(new Date());
    setEditId(null);
    setForm({ ...EMPTY_FORM, start_date: preDate ?? today, end_date: preDate ?? today });
    setFormPreDate(preDate ?? "");
    setFormOpen(true);
  };

  const openEdit = (s: Schedule) => {
    setEditId(s.id);
    setForm({
      vehicle_id:       s.vehicle_id,
      type:             s.type,
      title:            s.title,
      notes:            s.notes ?? "",
      start_date:       s.start_date,
      end_date:         s.end_date,
      start_time:       toInputTime(s.start_time),
      end_time:         toInputTime(s.end_time),
      assigned_user_id: s.assigned_user_id ?? "",
    });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditId(null); setForm(EMPTY_FORM); };

  const setF = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.vehicle_id) { toast.error("Selecione um veículo."); return; }
    if (!form.title.trim()) { toast.error("Título obrigatório."); return; }
    if (!form.start_date || !form.end_date) { toast.error("Datas obrigatórias."); return; }
    if (form.end_date < form.start_date) { toast.error("Data de fim não pode ser anterior ao início."); return; }
    if (!!form.start_time !== !!form.end_time) { toast.error("Informe hora de início e fim, ou deixe ambas em branco."); return; }
    if (form.start_time && form.end_time && form.end_time <= form.start_time) { toast.error("Hora de fim deve ser posterior à hora de início."); return; }
    setSaving(true);
    try {
      const payload = {
        vehicle_id:       form.vehicle_id,
        type:             form.type,
        title:            form.title.trim(),
        notes:            form.notes.trim() || undefined,
        start_date:       form.start_date,
        end_date:         form.end_date,
        start_time:       form.start_time || null,
        end_time:         form.end_time || null,
        assigned_user_id: form.assigned_user_id || null,
      };
      if (editId) {
        await updateFn({ data: { id: editId, ...payload } });
        toast.success("Agendamento atualizado.");
      } else {
        await createFn({ data: payload });
        toast.success("Agendamento criado.");
      }
      closeForm();
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Erro ao guardar.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remover este agendamento?")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("Agendamento removido.");
      setSchedules((p) => p.filter((s) => s.id !== id));
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Erro ao remover.");
    }
  };

  // ── Sheet events for selected day ──
  const sheetSchedules = useMemo(
    () => (sheetDay ? schedulesOnDay(schedules, sheetDay) : []),
    [sheetDay, schedules],
  );

  // ── Access guard ──
  if (authLoading) return null;
  if (!canRead && !isAdmin) return <Navigate to="/home" />;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-5 text-primary" />
          <h1 className="text-xl font-semibold">Agendamento de Veículos</h1>
        </div>
        {canWrite && (
          <Button size="sm" onClick={() => openCreate()} className="w-full sm:w-auto">
            <Plus className="size-4 mr-1.5" /> Novo Agendamento
          </Button>
        )}
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-base font-medium w-40 text-center capitalize">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </span>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="size-4" />
        </Button>
        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Calendar grid */}
      <div className="rounded-xl border overflow-hidden">
        {/* Day name headers */}
        <div className="grid grid-cols-7 bg-muted/50">
          {dayNames.map((n) => (
            <div key={n} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              {n}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 divide-x divide-y border-t">
          {/* Leading blanks */}
          {Array.from({ length: leadingBlanks }).map((_, i) => (
            <div key={`blank-${i}`} className="min-h-[60px] sm:min-h-[90px] bg-muted/20" />
          ))}

          {days.map((day) => {
            const daySchedules = schedulesOnDay(schedules, day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const todayClass = isToday(day) ? "bg-primary/5 ring-1 ring-inset ring-primary/40" : "";
            return (
              <div
                key={toIsoDate(day)}
                className={`min-h-[60px] sm:min-h-[90px] p-1 sm:p-1.5 flex flex-col gap-1 cursor-pointer transition-colors hover:bg-accent/30 ${todayClass} ${!isCurrentMonth ? "opacity-40" : ""}`}
                onClick={() => setSheetDay(day)}
              >
                <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? "bg-primary text-primary-foreground" : "text-foreground"}`}>
                  {format(day, "d")}
                </span>
                {/* Mobile: pontos coloridos (o texto não cabe na célula) */}
                <div className="flex flex-wrap gap-1 sm:hidden">
                  {daySchedules.slice(0, 5).map((s) => (
                    <span key={s.id} className={`inline-block size-1.5 rounded-full ${TYPE_DOT[s.type]}`} />
                  ))}
                  {daySchedules.length > 5 && (
                    <span className="text-[9px] text-muted-foreground leading-none">+{daySchedules.length - 5}</span>
                  )}
                </div>
                {/* Desktop/tablet: resumo em texto */}
                <div className="hidden sm:flex sm:flex-col gap-0.5 overflow-hidden">
                  {daySchedules.slice(0, 2).map((s) => (
                    <div
                      key={s.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium leading-tight ${TYPE_STYLE[s.type]}`}
                    >
                      {s.start_time && <>{toInputTime(s.start_time)} · </>}{s.vehicle_plate} · {s.title}
                    </div>
                  ))}
                  {daySchedules.length > 2 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{daySchedules.length - 2} mais
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-blue-500/25" /> Reserva
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3 rounded-sm bg-amber-500/25" /> Serviço
        </div>
      </div>

      {/* ── Day sheet ── */}
      <Sheet open={!!sheetDay} onOpenChange={(o) => { if (!o) setSheetDay(null); }}>
        <SheetContent className="w-full sm:max-w-md flex flex-col">
          <SheetHeader>
            <SheetTitle className="capitalize">
              {sheetDay && format(sheetDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {sheetSchedules.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Sem agendamentos neste dia.</p>
            ) : (
              sheetSchedules.map((s) => (
                <div key={s.id} className={`rounded-lg border p-3 space-y-1 ${TYPE_STYLE[s.type]} bg-transparent border-current/20`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
                          {TYPE_LABEL[s.type]}
                        </span>
                        <span className="text-[10px] opacity-60">·</span>
                        <span className="text-xs font-medium">{s.vehicle_plate}</span>
                        {s.vehicle_model && <span className="text-[11px] opacity-70">{s.vehicle_model}</span>}
                      </div>
                      <p className="text-sm font-semibold mt-0.5">{s.title}</p>
                      {s.start_time && s.end_time && (
                        <p className="text-[11px] font-medium opacity-80">{toInputTime(s.start_time)} – {toInputTime(s.end_time)}</p>
                      )}
                      {s.assigned_user_name && (
                        <p className="text-[11px] opacity-70">Motorista: {s.assigned_user_name}</p>
                      )}
                      {s.start_date !== s.end_date && (
                        <p className="text-[11px] opacity-60">
                          {format(parseISO(s.start_date), "dd/MM")} → {format(parseISO(s.end_date), "dd/MM")}
                        </p>
                      )}
                      {s.notes && <p className="text-[11px] opacity-60 mt-1">{s.notes}</p>}
                    </div>
                    {canWrite && (
                      <div className="flex gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="size-7"
                          onClick={() => { setSheetDay(null); openEdit(s); }}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(s.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          {canWrite && (
            <div className="border-t pt-3">
              <Button className="w-full" variant="outline" size="sm"
                onClick={() => { setSheetDay(null); openCreate(sheetDay ? toIsoDate(sheetDay) : undefined); }}>
                <Plus className="size-4 mr-1.5" /> Adicionar neste dia
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Form modal ── */}
      <Dialog open={formOpen} onOpenChange={(o) => { if (!o) closeForm(); }}>
        <DialogContent className="w-[95vw] max-w-lg sm:w-full">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Agendamento" : "Novo Agendamento"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Tipo</Label>
              <div className="flex gap-4">
                {(["reserva", "servico"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer select-none">
                    <input type="radio" name="type" checked={form.type === t}
                      onChange={() => setF("type", t)} className="accent-primary" />
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${TYPE_STYLE[t]}`}>
                      {TYPE_LABEL[t]}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Vehicle */}
            <div className="space-y-1.5">
              <Label htmlFor="ag-vehicle" className="text-xs text-muted-foreground">Veículo *</Label>
              <select
                id="ag-vehicle"
                value={form.vehicle_id}
                onChange={(e) => setF("vehicle_id", e.target.value)}
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Selecionar veículo…</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.plate}{v.model ? ` — ${v.model}` : ""}</option>
                ))}
              </select>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="ag-title" className="text-xs text-muted-foreground">Título *</Label>
              <Input id="ag-title" value={form.title}
                onChange={(e) => setF("title", e.target.value)}
                placeholder="ex: Manutenção preventiva / Entrega Coimbra" />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ag-start" className="text-xs text-muted-foreground">Data início *</Label>
                <Input id="ag-start" type="date" value={form.start_date}
                  onChange={(e) => { setF("start_date", e.target.value); if (!form.end_date || e.target.value > form.end_date) setF("end_date", e.target.value); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ag-end" className="text-xs text-muted-foreground">Data fim *</Label>
                <Input id="ag-end" type="date" value={form.end_date} min={form.start_date}
                  onChange={(e) => setF("end_date", e.target.value)} />
              </div>
            </div>

            {/* Times (optional — leave blank for all-day) */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Horário (opcional — deixe em branco para o dia inteiro)</Label>
              <div className="grid grid-cols-2 gap-3">
                <Input id="ag-start-time" type="time" value={form.start_time}
                  onChange={(e) => setF("start_time", e.target.value)} />
                <Input id="ag-end-time" type="time" value={form.end_time}
                  onChange={(e) => setF("end_time", e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Assim dá para agendar, ex: 08:00–12:00 com uma pessoa e 13:00–17:00 com outra, no mesmo dia e veículo.
              </p>
            </div>

            {/* Assigned user (for reserva) */}
            {form.type === "reserva" && (
              <div className="space-y-1.5">
                <Label htmlFor="ag-driver" className="text-xs text-muted-foreground">Motorista (opcional)</Label>
                <select
                  id="ag-driver"
                  value={form.assigned_user_id}
                  onChange={(e) => setF("assigned_user_id", e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Sem motorista associado</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.full_name ?? d.id}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="ag-notes" className="text-xs text-muted-foreground">Notas</Label>
              <Textarea id="ag-notes" value={form.notes} rows={2}
                onChange={(e) => setF("notes", e.target.value)}
                placeholder="Informação adicional…" />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeForm} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
              {editId ? "Guardar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
