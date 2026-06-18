// Config mínimo usado pelo Electron em produção para arrancar o vite preview.
// Não usa @lovable.dev/vite-tanstack-config (devDependency) — só o cloudflare plugin.
import { cloudflare } from "@cloudflare/vite-plugin";

export default {
  plugins: [cloudflare()],
};
