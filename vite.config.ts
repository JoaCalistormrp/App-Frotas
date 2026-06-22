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
    extraPlugins.push(nitro({ preset: "vercel" }));
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
