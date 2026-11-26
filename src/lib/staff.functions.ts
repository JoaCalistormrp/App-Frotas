import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RoleSchema = z.enum(["admin", "viewer", "mechanic", "master", "driver", "geral"]);

const KNOWN_MODULE_SLUGS = [
  "frotas",
  "frotas.dashboard",
  "frotas.checklists",
  "frotas.checklist_new",
  "frotas.manutencao",
  "frotas.os_mecanico",
  "frotas.veiculos",
  "frotas.motoristas",
  "frotas.lixeira",
  "frotas.checklists.pesados",
  "frotas.checklists.cesto_aereo",
  "frotas.checklists.operacionais",
  "frotas.checklists.maquinario",
  "frotas.checklists.munck",
  "frotas.checklists.administrativo",
  "financeiro",
  "frotas.agendamento",
  "frotas.agendamento.readonly",
  "utilizadores",
  "licitacao",
] as const;
const ModuleSlugSchema = z.enum(KNOWN_MODULE_SLUGS);

function formatPhoneForWaha(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  const cleaned = digits.startsWith("0") ? digits.slice(1) : digits;
  return "55" + cleaned;
}

async function isMaster(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "master")
    .limit(1)
    .maybeSingle();
  return !!data;
}

async function assertCanGrantMaster(callerId: string, targetRole: string, currentRole: string | null) {
  if (targetRole !== "master" || currentRole === "master") return;
  if (!(await isMaster(callerId))) throw new Error("Apenas master pode conceder acesso master.");
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "master"])
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem gerenciar utilizadores.");
}

export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data: roles, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "viewer", "mechanic", "master", "driver", "geral"]);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (ids.length === 0) return [];

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, cpf, driver_active, electrician_active, phone")
      .in("id", ids);
    const profMap = new Map(
      (profiles ?? []).map((p) => [p.id, { full_name: p.full_name as string | null, cpf: p.cpf as string | null, driver_active: p.driver_active as boolean, electrician_active: p.electrician_active as boolean, phone: p.phone as string | null }])
    );

    let authUsers: Array<{ id: string; email?: string }> = [];
    try {
      const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
      if (usersErr) console.error("[listStaff] listUsers error:", usersErr.message);
      else authUsers = usersData?.users ?? [];
    } catch (err) {
      console.error("[listStaff] listUsers threw:", err);
    }
    const emailMap = new Map(authUsers.map((u) => [u.id, u.email ?? ""]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: moduleRows, error: modListErr } = await (supabaseAdmin as any)
      .from("user_module_access")
      .select("user_id, module_slug")
      .in("user_id", ids);
    if (modListErr) console.error("[listStaff] module_access query error:", modListErr);
    const modulesMap = new Map<string, string[]>();
    for (const m of (moduleRows ?? []) as Array<{ user_id: string; module_slug: string }>) {
      const arr = modulesMap.get(m.user_id) ?? [];
      arr.push(m.module_slug);
      modulesMap.set(m.user_id, arr);
    }

    const byUser = new Map<string, { id: string; email: string; full_name: string | null; cpf: string | null; phone: string | null; roles: string[]; driver_active: boolean; electrician_active: boolean; modules: string[] }>();
    for (const r of roles ?? []) {
      const prof = profMap.get(r.user_id);
      const cur = byUser.get(r.user_id) ?? {
        id: r.user_id,
        email: emailMap.get(r.user_id) ?? "",
        full_name: prof?.full_name ?? null,
        cpf: prof?.cpf ?? null,
        phone: prof?.phone ?? null,
        roles: [],
        driver_active: prof?.driver_active ?? false,
        electrician_active: prof?.electrician_active ?? false,
        modules: modulesMap.get(r.user_id) ?? [],
      };
      cur.roles.push(r.role);
      byUser.set(r.user_id, cur);
    }
    return Array.from(byUser.values()).sort((a, b) => (a.full_name ?? a.email).localeCompare(b.full_name ?? b.email));
  });

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  const arr = new Uint8Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

const cpfSchema = z
  .string()
  .max(18)
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 11, {
    message: "CPF deve ter pelo menos 11 dígitos",
  })
  .default("");

export const createStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email().optional().or(z.literal("")),
      cpf: cpfSchema,
      full_name: z.string().min(1).max(120),
      phone: z.string().max(20).optional().default(""),
      role: RoleSchema,
      driver_active: z.boolean(),
      electrician_active: z.boolean().default(false),
      modules: z.array(ModuleSlugSchema),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await assertCanGrantMaster(context.userId, data.role, null);

    const cpfDigits = data.cpf.replace(/\D/g, "");
    const phoneFormatted = formatPhoneForWaha(data.phone ?? "");

    // Only check uniqueness when CPF is provided
    if (cpfDigits) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("cpf", data.cpf)
        .maybeSingle();
      if (existing) throw new Error(`Já existe um utilizador com o CPF ${data.cpf}.`);
    }

    // If no email provided, auto-generate from CPF; require at least one
    const email = data.email?.trim() || (cpfDigits.length >= 11 ? `${cpfDigits}@grupotomaz.com.br` : "");
    if (!email) throw new Error("Informe um e-mail ou um CPF válido (11 dígitos) para gerar o acesso.");

    const password = generateTempPassword();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    await supabaseAdmin.from("profiles").upsert({ id: uid, full_name: data.full_name, cpf: cpfDigits ? data.cpf : null, driver_active: data.driver_active, electrician_active: data.electrician_active, phone: phoneFormatted || null });
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid).eq("role", "driver");
    const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: uid, role: data.role });
    if (rErr) throw new Error(rErr.message);

    if (data.modules.length) {
      const rows = data.modules.map((m) => ({ user_id: uid, module_slug: m, granted_by: context.userId }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: mErr } = await (supabaseAdmin as any).from("user_module_access").insert(rows);
      if (mErr) {
        console.error("[createStaffUser] module insert error:", mErr, "rows:", rows);
        throw new Error(`Módulos: ${mErr.message}`);
      }
    }
    return { id: uid, tempPassword: password };
  });

export const updateStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      full_name: z.string().min(1).max(120),
      cpf: cpfSchema,
      phone: z.string().max(20).optional().default(""),
      role: RoleSchema,
      driver_active: z.boolean(),
      electrician_active: z.boolean().default(false),
      modules: z.array(ModuleSlugSchema),
    }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: currentRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .limit(1)
      .maybeSingle();
    await assertCanGrantMaster(context.userId, data.role, currentRow?.role ?? null);

    const cpfDigits = data.cpf.replace(/\D/g, "");
    const phoneFormatted = formatPhoneForWaha(data.phone ?? "");

    // Check CPF uniqueness only when provided
    if (cpfDigits) {
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("cpf", data.cpf)
        .neq("id", data.user_id)
        .maybeSingle();
      if (existing) throw new Error(`O CPF ${data.cpf} já está em uso por outro utilizador.`);
    }

    await supabaseAdmin.from("profiles").update({ full_name: data.full_name, cpf: cpfDigits ? data.cpf : null, driver_active: data.driver_active, electrician_active: data.electrician_active, phone: phoneFormatted || null }).eq("id", data.user_id);

    // Replace role (single role per user)
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role });

    // Replace modules: delete all existing then re-insert
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const moduleDb = supabaseAdmin as any;
    const { error: delErr } = await moduleDb.from("user_module_access").delete().eq("user_id", data.user_id);
    if (delErr) {
      console.error("[updateStaffUser] module delete error:", delErr);
      throw new Error(`Módulos (apagar): ${delErr.message}`);
    }
    if (data.modules.length) {
      const rows = data.modules.map((m: string) => ({ user_id: data.user_id, module_slug: m, granted_by: context.userId }));
      const { error: insErr } = await moduleDb.from("user_module_access").insert(rows);
      if (insErr) {
        console.error("[updateStaffUser] module insert error:", insErr, "rows:", rows);
        throw new Error(`Módulos (inserir): ${insErr.message}`);
      }
    }
    return { ok: true };
  });

export const updateStaffProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid(), driver_active: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("profiles").update({ driver_active: data.driver_active }).eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteStaffUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (data.user_id === context.userId) throw new Error("Você não pode remover o seu próprio acesso.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Public — no auth required. Used by the login screen to resolve CPF → real email.
// Uses the Supabase RPC `get_email_by_cpf` (SECURITY DEFINER) to avoid loading all profiles in memory.
export const findEmailByCpf = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ cpf: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const digits = data.cpf.replace(/\D/g, "");
    if (digits.length < 11) return { email: null };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: email } = await (supabaseAdmin as any).rpc("get_email_by_cpf", { cpf_input: digits });
    return { email: (email as string | null) ?? null };
  });
