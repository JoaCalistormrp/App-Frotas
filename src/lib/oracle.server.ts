import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ── Thick mode init (runs once per process) ────────────────────────────────
// Thick mode supports all Oracle password verifiers (including 0x939 / 11g).
// Requires Oracle Instant Client.  If not found, thin mode is used instead.
let _oracleInitDone = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryEnableThickMode(oracledb: any) {
  if (_oracleInitDone) return;
  _oracleInitDone = true;
  // Priority: env var → common Windows paths → auto-detect from PATH
  const candidates: (string | undefined)[] = [
    process.env.ORACLE_CLIENT_DIR,
    "C:\\instantclient",
    "C:\\oracle\\instantclient",
    undefined, // let oracledb search PATH / LD_LIBRARY_PATH
  ];
  for (const libDir of candidates) {
    try {
      oracledb.initOracleClient(libDir !== undefined ? { libDir } : undefined);
      console.log(`[oracle] Thick mode activado (libDir=${libDir ?? "auto"})`);
      return;
    } catch {
      // try next candidate
    }
  }
  console.warn("[oracle] Oracle Instant Client não encontrado — a usar thin mode.");
  console.warn("[oracle] Se obtiver NJS-116, instale o Oracle Instant Client e defina ORACLE_CLIENT_DIR.");
}

// ── Server function ────────────────────────────────────────────────────────
export const queryOracleFinancial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const { documento, ap } = input as { documento: string; ap: string };
    if (!documento?.trim() || !ap?.trim()) throw new Error("documento e ap são obrigatórios");
    return { documento: documento.trim(), ap: ap.trim() };
  })
  .handler(async ({ data }) => {
    const { documento, ap } = data;

    // Dynamic import so CF Workers fail gracefully (oracledb is Node.js-only)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let oracledb: any;
    try {
      oracledb = (await import("oracledb" as string)).default
             ?? (await import("oracledb" as string));
    } catch {
      throw new Error("Driver Oracle não disponível neste ambiente. Use a versão desktop.");
    }

    // Attempt thick mode (supports all auth verifiers including 0x939)
    tryEnableThickMode(oracledb);

    let conn: any;
    try {
      conn = await oracledb.getConnection({
        user:           process.env.ORACLE_DB_USER     ?? "CONSTREV",
        password:       process.env.ORACLE_DB_PASSWORD ?? "REDACTED",
        connectString:  process.env.ORACLE_DB_HOST     ?? "dbconnect.megaerp.online:4221/xepdb1",
        connectTimeout: 15,
      });
    } catch (connErr: unknown) {
      const msg = connErr instanceof Error ? connErr.message : String(connErr);
      if (msg.includes("NJS-116")) {
        throw new Error(
          "NJS-116: O servidor Oracle usa um hash de password antigo (11g) não suportado " +
          "pelo modo thin.\n\nSoluções:\n" +
          "1. Instale o Oracle Instant Client e defina a variável ORACLE_CLIENT_DIR.\n" +
          "2. Peça ao DBA para regenerar a password do utilizador Oracle.",
        );
      }
      throw new Error(`Erro de ligação Oracle: ${msg}`);
    }

    try {
      const result = await conn.execute(
        `SELECT PROJETO, EXTENSO_PRO, SUM(VALOR) AS VALOR
           FROM MEGA.VW_CONTAS_A_PAGAR@CONSTREV
          WHERE DOCUMENTO = :1
            AND AP        = :2
          GROUP BY PROJETO, EXTENSO_PRO
          ORDER BY EXTENSO_PRO, PROJETO`,
        [documento, ap],
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      const rows = (result.rows ?? []) as Array<Record<string, unknown>>;
      return {
        rows: rows.map((r) => ({
          projeto:     String(r["PROJETO"]     ?? ""),
          extenso_pro: String(r["EXTENSO_PRO"] ?? ""),
          valor:       (r["VALOR"] as number | null) ?? null,
        })),
      };
    } finally {
      await conn.close();
    }
  });
