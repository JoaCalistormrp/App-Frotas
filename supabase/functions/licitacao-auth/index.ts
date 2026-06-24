// licitacao-auth — validação de dispositivo + rate limiting + audit log
// Ref: "The Web Application Hacker's Handbook" Cap.6 (Brute Force), Cap.2 (Audit Trail)
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cap.6: Rate limit — máx. 10 tentativas falhadas por IP em 15 minutos
const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS   = 10;

function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

function deny(reason: string, status = 403) {
  return new Response(JSON.stringify({ authorized: false, reason }), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return deny("missing_auth", 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Verificar utilizador pelo JWT
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !user) return deny("invalid_token", 401);

  const clientIp = getClientIp(req);

  // ── Cap.6: Rate limiting por IP ─────────────────────────────────────────
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabaseAdmin
    .from("auth_attempts")
    .select("id", { count: "exact", head: true })
    .eq("identifier", clientIp)
    .eq("action", "licitacao_auth")
    .eq("success", false)
    .gte("created_at", windowStart) as { count: number | null };

  if ((count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    await supabaseAdmin.from("auth_attempts").insert({
      identifier: clientIp, action: "licitacao_auth", success: false,
    });
    return deny("rate_limited", 429);
  }

  // ── Verificar acesso ao módulo licitacao ────────────────────────────────
  const [{ data: moduleAccess }, { data: roleRow }] = await Promise.all([
    supabaseAdmin.from("user_module_access").select("id")
      .eq("user_id", user.id).eq("module_slug", "licitacao").maybeSingle(),
    supabaseAdmin.from("user_roles").select("role")
      .eq("user_id", user.id).in("role", ["admin", "master"]).maybeSingle(),
  ]);

  if (!moduleAccess && !roleRow) {
    await supabaseAdmin.from("auth_attempts").insert({
      identifier: clientIp, action: "licitacao_auth", success: false,
    });
    return deny("no_module_access");
  }

  // ── Validar device token ────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as {
    device_token?: string; device_label?: string;
  };
  const { device_token, device_label } = body;

  if (!device_token || typeof device_token !== "string" || device_token.length > 100) {
    return deny("no_device_token");
  }

  const { data: device } = await supabaseAdmin
    .from("licitacao_trusted_devices")
    .select("*")
    .eq("user_id", user.id)
    .eq("token", device_token)
    .maybeSingle();

  if (!device) {
    // Registar novo dispositivo como pendente
    await supabaseAdmin.from("licitacao_trusted_devices").insert({
      user_id: user.id,
      token: device_token,
      device_label: (device_label ?? "Dispositivo desconhecido").slice(0, 120),
      ip_address: clientIp,
      approved: false,
    });
    // Registar tentativa falhada
    await supabaseAdmin.from("auth_attempts").insert({
      identifier: clientIp, action: "licitacao_auth", success: false,
    });
    return deny("pending_approval");
  }

  if (!device.approved) {
    await supabaseAdmin.from("auth_attempts").insert({
      identifier: clientIp, action: "licitacao_auth", success: false,
    });
    return deny("pending_approval");
  }

  // ── Acesso concedido ────────────────────────────────────────────────────
  // Atualizar IP e registar sucesso no audit log
  await Promise.all([
    supabaseAdmin.from("licitacao_trusted_devices")
      .update({ ip_address: clientIp })
      .eq("id", device.id),
    supabaseAdmin.from("auth_attempts").insert({
      identifier: clientIp, action: "licitacao_auth", success: true,
    }),
    supabaseAdmin.from("security_audit_log").insert({
      user_id: user.id,
      action: "licitacao_access_granted",
      resource: "licitacoes",
      details: { device_id: device.id, device_label: device.device_label },
      ip_address: clientIp,
    }),
  ]);

  return new Response(JSON.stringify({ authorized: true, ip: clientIp }), {
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
