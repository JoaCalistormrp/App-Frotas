import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertMaster(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "master")
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Apenas utilizadores Master podem aprovar ou negar ordens.");
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem excluir ordens.");
}

export const approveMaintenanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ order_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertMaster(context.userId);

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("maintenance_orders")
      .select("status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (fetchErr || !order) throw new Error("Ordem não encontrada.");
    if ((order as any).status !== "aguardando_aprovacao") {
      throw new Error("Apenas ordens em aguardando_aprovacao podem ser aprovadas.");
    }

    const approvedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("maintenance_orders")
      .update({ status: "aprovada", approved_at: approvedAt, approved_by: context.userId, denial_reason: null } as never)
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("maintenance_evolutions").insert({
      order_id: data.order_id,
      user_id: context.userId,
      status: "aprovada",
      observation: "SMV/SMI aprovada pelo Master.",
    });

    return { approved_at: approvedAt };
  });

export const denyMaintenanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      order_id: z.string().uuid(),
      reason:   z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertMaster(context.userId);

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("maintenance_orders")
      .select("status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (fetchErr || !order) throw new Error("Ordem não encontrada.");
    if ((order as any).status !== "aguardando_aprovacao") {
      throw new Error("Apenas ordens em aguardando_aprovacao podem ser negadas.");
    }

    const { error } = await supabaseAdmin
      .from("maintenance_orders")
      .update({ status: "negada", denial_reason: data.reason } as never)
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("maintenance_evolutions").insert({
      order_id: data.order_id,
      user_id: context.userId,
      status: "negada",
      observation: `SMV/SMI negada pelo Master. Motivo: ${data.reason}`,
    });

    return { ok: true };
  });

export const softDeleteMaintenanceOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      order_id: z.string().uuid(),
      reason:   z.string().min(1).max(500),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("maintenance_orders")
      .select("status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (fetchErr || !order) throw new Error("Ordem não encontrada.");

    const orderStatus = (order as any).status as string;

    // Remove financial links for finalized orders
    if (orderStatus === "finalizada") {
      await (supabaseAdmin as any)
        .from("maintenance_financial_links")
        .delete()
        .eq("maintenance_order_id", data.order_id);

      await (supabaseAdmin as any)
        .from("maintenance_os_link_finalized")
        .delete()
        .eq("maintenance_order_id", data.order_id);
    }

    const { error } = await supabaseAdmin
      .from("maintenance_orders")
      .update({
        deleted_at:    new Date().toISOString(),
        deleted_by:    context.userId,
        delete_reason: data.reason,
      } as never)
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("maintenance_evolutions").insert({
      order_id: data.order_id,
      user_id: context.userId,
      status: null,
      observation: `OS movida para a lixeira. Motivo: ${data.reason}`,
    });

    return { ok: true };
  });
