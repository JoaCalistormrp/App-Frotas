// Gera os ficheiros de config + bundle standalone que o Miniflare consegue correr
const fs   = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

async function main() {
  // 1. Bundle server.js + todas as dependências num único ficheiro ESM standalone
  // O server.js produzido pelo vite build tem imports externos (h3-v2, etc.)
  // que o Miniflare não resolve — o esbuild inline tudo num único ficheiro.
  const esbuild = require(path.join(root, "node_modules", "esbuild"));
  const serverEntry  = path.join(root, "dist", "server", "server.js");
  const serverBundle = path.join(root, "dist", "server", "server.bundled.js");

  await esbuild.build({
    entryPoints: [serverEntry],
    outfile: serverBundle,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome112",
    external: ["node:*", "oracledb", "__STATIC_CONTENT_MANIFEST"],
    absWorkingDir: path.join(root, "dist", "server"),
    logLevel: "warning",
  });
  console.log("✓ dist/server/server.bundled.js gerado");

  // 2. dist/server/wrangler.json — aponta para o bundle standalone
  const wranglerJson = {
    name: "tanstack-start-app",
    compatibility_date: "2025-09-24",
    compatibility_flags: ["nodejs_compat"],
    main: "server.bundled.js",
  };
  const wranglerJsonPath = path.join(root, "dist", "server", "wrangler.json");
  fs.writeFileSync(wranglerJsonPath, JSON.stringify(wranglerJson, null, 2));
  console.log("✓ dist/server/wrangler.json gerado");

  // 3. .wrangler/deploy/config.json — aponta para o wrangler.json acima
  const deployDir = path.join(root, ".wrangler", "deploy");
  fs.mkdirSync(deployDir, { recursive: true });
  const deployConfig = {
    configPath: "../../dist/server/wrangler.json",
    auxiliaryWorkers: [],
  };
  fs.writeFileSync(
    path.join(deployDir, "config.json"),
    JSON.stringify(deployConfig, null, 2)
  );
  console.log("✓ .wrangler/deploy/config.json gerado");
}

main().catch((err) => { console.error(err); process.exit(1); });
