import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await client.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Module authorization ───────────────────────────────────────────────────
  const { data: access } = await client
    .from("user_module_access")
    .select("module_slug")
    .eq("user_id", user.id)
    .eq("module_slug", "financeiro")
    .maybeSingle();
  if (!access) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Validate Oracle credentials ────────────────────────────────────────────
  const ORACLE_USER    = Deno.env.get("ORACLE_USER");
  const ORACLE_PASS    = Deno.env.get("ORACLE_PASS");
  const ORACLE_HOST    = Deno.env.get("ORACLE_HOST");
  const ORACLE_PORT    = parseInt(Deno.env.get("ORACLE_PORT") ?? "4221");
  const ORACLE_SERVICE = Deno.env.get("ORACLE_SERVICE");

  if (!ORACLE_USER || !ORACLE_PASS || !ORACLE_HOST || !ORACLE_SERVICE) {
    return new Response(JSON.stringify({ error: "Servidor não configurado. Contacte o administrador." }), {
      status: 503,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let documento: string, ap: string;
  try {
    const body = await req.json();
    documento = String(body.documento ?? "").trim();
    ap        = String(body.ap        ?? "").trim();
    if (!documento || !ap) throw new Error("missing fields");
  } catch {
    return new Response(JSON.stringify({ error: "documento e ap são obrigatórios" }), {
      status: 400,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  // ── Oracle query ───────────────────────────────────────────────────────────
  try {
    const oracledb = (await import("npm:oracledb@6")).default;

    const connection = await oracledb.getConnection({
      user:          ORACLE_USER,
      password:      ORACLE_PASS,
      connectString: `${ORACLE_HOST}:${ORACLE_PORT}/${ORACLE_SERVICE}`,
    });

    try {
      const result = await connection.execute<{ VALOR: number | null }>(
        `SELECT VALOR FROM VW_CONTAS_A_PAGAR
          WHERE DOCUMENTO = :1
            AND AP        = :2
          FETCH FIRST 1 ROWS ONLY`,
        [documento, ap],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );

      const row   = result.rows?.[0];
      const valor = row?.VALOR ?? null;

      return new Response(JSON.stringify({ valor }), {
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    } finally {
      await connection.close();
    }
  } catch (err) {
    console.error("Oracle error:", err);
    return new Response(
      JSON.stringify({ error: "Erro ao consultar ERP Mega" }),
      { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
