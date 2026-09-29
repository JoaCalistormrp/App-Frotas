import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(async ({ command }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extraPlugins: any[] = [];
  if (command === "build") {
    const { nitro } = await import("nitro/vite");
    // O build do site (Vercel) usa o preset "vercel" (padrão). O build do
    // Electron (`npm run electron:build`/`electron:win`) define ELECTRON_BUILD=1
    // para gerar um servidor Node autónomo em vez disso — não afeta o deploy Vercel.
    const preset = process.env.ELECTRON_BUILD ? "node" : "vercel";
    extraPlugins.push(nitro({ preset }));
  }

  return {
    plugins: [
      viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart({
        importProtection: {
          client: {
            excludeFiles: ["**/oracle.server.*"],
          },
        },
      }),
      react(),
      VitePWA({
        registerType: "autoUpdate",
        manifest: false,
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,woff2}"],
          globIgnores: ["server/**", "*.bundled.js"],
        },
        devOptions: { enabled: false },
      }),
      ...extraPlugins,
    ],
  };
});
