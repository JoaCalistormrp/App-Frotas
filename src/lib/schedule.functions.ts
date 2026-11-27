import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertScheduleAccess(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (data) return; // admin/master: ok

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mod } = await (supabaseAdmin as any)
    .from("user_module_access")
    .select("module_slug")
    .eq("user_id", userId)
    .in("module_slug", ["frotas.agendamento", "frotas.agendamento.readonly"])
    .limit(1)
    .maybeSingle();
  if (!mod) throw new Error("Sem acesso ao módulo de agendamento.");
}

async function assertScheduleOwnership(userId: string, scheduleId: string) {
  const { data: isAdmin } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (isAdmin) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: schedule } = await (supabaseAdmin as any)
    .from("vehicle_schedules")
    .select("created_by")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!schedule || schedule.created_by !== userId) {
    throw new Error("Sem permissão para modificar este agendamento.");
  }
}

const TIME_RE = /^\d{2}:\d{2}$/;

function timesOverlap(aStart: string | null, aEnd: string | null, bStart: string | null, bEnd: string | null): boolean {
  // Sem horário definido = dia inteiro: conflita com qualquer outro agendamento nesse dia.
  if (!aStart || !aEnd || !bStart || !bEnd) return true;
  return aStart < bEnd && bStart < aEnd;
}

async function assertNoTimeConflict(opts: {
  vehicleId: string; startDate: string; endDate: string;
  startTime: string | null; endTime: string | null; excludeId?: string;
}) {
  let query = supabaseAdmin
    .from("vehicle_schedules")
    .select("id, start_date, end_date, start_time, end_time, title")
    .eq("vehicle_id", opts.vehicleId)
    .lte("start_date", opts.endDate)
    .gte("end_date", opts.startDate);
  if (opts.excludeId) query = query.neq("id", opts.excludeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const conflict = (data ?? []).find((row) =>
    timesOverlap(opts.startTime, opts.endTime, row.start_time, row.end_time),
  );
  if (conflict) {
    throw new Error(`Conflito de horário com "${conflict.title}" neste veículo.`);
  }
}

async function assertScheduleWrite(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (data) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mod } = await (supabaseAdmin as any)
    .from("user_module_access")
    .select("module_slug")
    .eq("user_id", userId)
    .eq("module_slug", "frotas.agendamento")
    .maybeSingle();
  if (!mod) throw new Error("Sem permissão para criar/editar agendamentos.");
}

export const listSchedules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      year:  z.number().int().min(2020).max(2100),
      month: z.number().int().min(1).max(12),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertScheduleAccess(context.userId);

    const startDate = `${data.year}-${String(data.month).padStart(2, "0")}-01`;
    const lastDay = new Date(data.year, data.month, 0).getDate();
    const endDate = `${data.year}-${String(data.month).padStart(2, "0")}-${lastDay}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("vehicle_schedules")
      .select(`
        id, vehicle_id, type, title, notes, start_date, end_date, start_time, end_time,
        assigned_user_id, created_by, created_at,
        vehicles(plate, model)
      `)
      // Agendamentos que tocam o mês: começam até o fim do mês E terminam a partir do início dele
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .order("start_date", { ascending: true })
      .limit(500);

    if (error) throw new Error(error.message);

    const assignedIds = (rows as any[])
      .map((r: any) => r.assigned_user_id)
      .filter(Boolean) as string[];

    let profilesMap: Map<string, string> = new Map();
    if (assignedIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedIds);
      profilesMap = new Map((profiles ?? []).map((p) => [p.id, (p.full_name as string) ?? ""]));
    }

    return (rows as any[]).map((r: any) => ({
      id:                 r.id as string,
      vehicle_id:         r.vehicle_id as string,
      vehicle_plate:      (r.vehicles?.plate ?? "") as string,
      vehicle_model:      (r.vehicles?.model ?? null) as string | null,
      type:               r.type as "reserva" | "servico",
      title:              r.title as string,
      notes:              (r.notes ?? null) as string | null,
      start_date:         r.start_date as string,
      end_date:           r.end_date as string,
      start_time:         (r.start_time ?? null) as string | null,
      end_time:           (r.end_time ?? null) as string | null,
      assigned_user_id:   (r.assigned_user_id ?? null) as string | null,
      assigned_user_name: r.assigned_user_id ? (profilesMap.get(r.assigned_user_id) ?? null) : null,
      created_by:         r.created_by as string,
    }));
  });

export const createSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      vehicle_id:       z.string().uuid(),
      type:             z.enum(["reserva", "servico"]),
      title:            z.string().min(1).max(200),
      notes:            z.string().max(1000).optional(),
      start_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start_time:       z.string().regex(TIME_RE).optional().nullable(),
      end_time:         z.string().regex(TIME_RE).optional().nullable(),
      assigned_user_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertScheduleWrite(context.userId);
    if (data.end_date < data.start_date) throw new Error("Data de fim deve ser igual ou posterior à data de início.");
    if (!!data.start_time !== !!data.end_time) throw new Error("Informe hora de início e fim, ou deixe ambas em branco.");
    if (data.start_time && data.end_time && data.end_time <= data.start_time) throw new Error("Hora de fim deve ser posterior à hora de início.");
    await assertNoTimeConflict({
      vehicleId: data.vehicle_id, startDate: data.start_date, endDate: data.end_date,
      startTime: data.start_time ?? null, endTime: data.end_time ?? null,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error } = await (supabaseAdmin as any)
      .from("vehicle_schedules")
      .insert({
        vehicle_id:       data.vehicle_id,
        type:             data.type,
        title:            data.title,
        notes:            data.notes ?? null,
        start_date:       data.start_date,
        end_date:         data.end_date,
        start_time:       data.start_time ?? null,
        end_time:         data.end_time ?? null,
        assigned_user_id: data.assigned_user_id ?? null,
        created_by:       context.userId,
      })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return { id: (row as { id: string }).id };
  });

export const updateSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id:               z.string().uuid(),
      vehicle_id:       z.string().uuid(),
      type:             z.enum(["reserva", "servico"]),
      title:            z.string().min(1).max(200),
      notes:            z.string().max(1000).optional().nullable(),
      start_date:       z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      end_date:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      start_time:       z.string().regex(TIME_RE).optional().nullable(),
      end_time:         z.string().regex(TIME_RE).optional().nullable(),
      assigned_user_id: z.string().uuid().optional().nullable(),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertScheduleWrite(context.userId);
    await assertScheduleOwnership(context.userId, data.id);
    if (data.end_date < data.start_date) throw new Error("Data de fim deve ser igual ou posterior à data de início.");
    if (!!data.start_time !== !!data.end_time) throw new Error("Informe hora de início e fim, ou deixe ambas em branco.");
    if (data.start_time && data.end_time && data.end_time <= data.start_time) throw new Error("Hora de fim deve ser posterior à hora de início.");
    await assertNoTimeConflict({
      vehicleId: data.vehicle_id, startDate: data.start_date, endDate: data.end_date,
      startTime: data.start_time ?? null, endTime: data.end_time ?? null, excludeId: data.id,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from("vehicle_schedules")
      .update({
        vehicle_id:       data.vehicle_id,
        type:             data.type,
        title:            data.title,
        notes:            data.notes ?? null,
        start_date:       data.start_date,
        end_date:         data.end_date,
        start_time:       data.start_time ?? null,
        end_time:         data.end_time ?? null,
        assigned_user_id: data.assigned_user_id ?? null,
        updated_at:       new Date().toISOString(),
      })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertScheduleWrite(context.userId);
    await assertScheduleOwnership(context.userId, data.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabaseAdmin as any)
      .from("vehicle_schedules")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
