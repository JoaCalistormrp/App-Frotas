import { useEffect } from "react";
import { createRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Depois de um deploy, os arquivos de tela da versão anterior deixam de existir (404).
// Quem estava com o sistema aberto e troca de tela cai aqui; recarregar busca a versão nova.
const STALE_CHUNK = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading (CSS )?chunk|Unable to preload CSS/i;
const RELOAD_KEY = "erp:reload-versao-nova";

function isStaleChunkError(error: unknown) {
  return error instanceof Error && STALE_CHUNK.test(error.message);
}

// Recarrega no máximo uma vez a cada 30 s para nunca entrar em ciclo
function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    /* sem sessionStorage: recarrega mesmo assim */
  }
  window.location.reload();
  return true;
}

let preloadListener = false;
function listenForStaleChunks() {
  if (preloadListener || typeof window === "undefined") return;
  preloadListener = true;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
}

function DefaultErrorComponent({ error }: ErrorComponentProps) {
  const stale = isStaleChunkError(error);

  useEffect(() => {
    if (stale) reloadForNewVersion();
  }, [stale]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {stale ? "O sistema foi atualizado" : "Algo deu errado"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "Há uma versão nova do ERP. Recarregue a página para continuar de onde parou."
            : "Não foi possível abrir esta tela. Verifique a conexão com a internet e tente de novo."}
        </p>
        {import.meta.env.DEV && error instanceof Error && error.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">{error.message}</pre>
        )}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Recarregar página
          </button>
          <a
            href="/home"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const getRouter = () => {
  listenForStaleChunks();
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
  });

  return router;
};
