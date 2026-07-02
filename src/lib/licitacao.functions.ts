import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const LicitacaoStatusSchema = z.enum([
  "mapeada", "em_analise", "proposta_enviada",
  "aguardando_resultado", "ganha", "perdida",
]);

const LicitacaoModalidadeSchema = z.enum([
  "pregao_eletronico", "pregao_presencial", "concorrencia",
  "tomada_de_precos", "convite", "dispensa", "inexigibilidade",
]).nullable();

const LicitacaoInputSchema = z.object({
  titulo:           z.string().min(1).max(300),
  numero_processo:  z.string().max(50).nullable().optional(),
  orgao_licitante:  z.string().max(200).nullable().optional(),
  valor_estimado:   z.number().max(999_999_999).nullable().optional(),
  modalidade:       LicitacaoModalidadeSchema.optional(),
  responsavel_id:   z.string().uuid().nullable().optional(),
  data_abertura:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  data_vencimento:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  observacoes:      z.string().max(2000).nullable().optional(),
  status:           LicitacaoStatusSchema,
});

async function assertLicitacaoAccess(userId: string) {
  const [{ data: moduleAccess }, { data: roleRow }] = await Promise.all([
    (supabaseAdmin as any)
      .from("user_module_access")
      .select("id")
      .eq("user_id", userId)
      .eq("module_slug", "licitacao")
      .maybeSingle(),
    supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["admin", "master"])
      .limit(1)
      .maybeSingle(),
  ]);
  if (!moduleAccess && !roleRow) throw new Error("Sem acesso ao módulo de licitações.");
}

async function assertLicitacaoAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem eliminar licitações.");
}

export const createLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => LicitacaoInputSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertLicitacaoAccess(context.userId);

    const { data: row, error } = await (supabaseAdmin as any)
      .from("licitacoes")
      .insert({
        titulo:          data.titulo.trim(),
        numero_processo: data.numero_processo ?? null,
        orgao_licitante: data.orgao_licitante ?? null,
        valor_estimado:  data.valor_estimado ?? null,
        modalidade:      data.modalidade ?? null,
        responsavel_id:  data.responsavel_id ?? null,
        data_abertura:   data.data_abertura ?? null,
        data_vencimento: data.data_vencimento ?? null,
        observacoes:     data.observacoes ?? null,
        status:          data.status,
        created_by:      context.userId,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const updateLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).merge(LicitacaoInputSchema).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertLicitacaoAccess(context.userId);

    const { id, ...fields } = data;
    const { data: row, error } = await (supabaseAdmin as any)
      .from("licitacoes")
      .update({
        titulo:          fields.titulo.trim(),
        numero_processo: fields.numero_processo ?? null,
        orgao_licitante: fields.orgao_licitante ?? null,
        valor_estimado:  fields.valor_estimado ?? null,
        modalidade:      fields.modalidade ?? null,
        responsavel_id:  fields.responsavel_id ?? null,
        data_abertura:   fields.data_abertura ?? null,
        data_vencimento: fields.data_vencimento ?? null,
        observacoes:     fields.observacoes ?? null,
        status:          fields.status,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const moveLicitacaoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: LicitacaoStatusSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertLicitacaoAccess(context.userId);

    const { data: row, error } = await (supabaseAdmin as any)
      .from("licitacoes")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return row;
  });

export const deleteLicitacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertLicitacaoAdmin(context.userId);

    const { error } = await (supabaseAdmin as any)
      .from("licitacoes")
      .delete()
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
