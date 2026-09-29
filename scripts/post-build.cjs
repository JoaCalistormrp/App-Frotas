// Gera electron/public-env.generated.json com os valores PÚBLICOS do Supabase
// (URL + chave publishable — os mesmos que já vão embutidos no bundle do
// cliente, não são segredo) para a app Electron arrancar sem precisar de
// nenhuma configuração local. Segredos reais (Oracle, chave service_role)
// ficam de fora daqui — esses vivem cifrados, gravados via
// `"Checklist Frota.exe" --configure-credentials` (ver electron/main.cjs).
const fs   = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function loadDotEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i === -1 || line.trim().startsWith("#")) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    out[key] = value;
  }
  return out;
}

function main() {
  const env = { ...loadDotEnv(path.join(root, ".env")), ...loadDotEnv(path.join(root, ".env.local")), ...process.env };

  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    console.error("✗ SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY não encontrados em .env — o build do Electron não vai conseguir falar com o Supabase.");
    process.exit(1);
  }

  const out = { SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: publishableKey };
  const outPath = path.join(root, "electron", "public-env.generated.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`✓ electron/public-env.generated.json gerado (${url})`);
}

main();
