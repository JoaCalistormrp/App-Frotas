import { createFileRoute, Outlet, Navigate, useRouterState } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ERPSidebar } from "@/components/erp-sidebar";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

// Screen slug → path prefix (more specific paths listed first)
const FROTAS_SCREEN_GUARDS: Array<[path: string, slug: string]> = [
  ["/admin/maintenance/trash", "frotas.lixeira"],
  ["/admin/maintenance",       "frotas.manutencao"],
  ["/admin/checklists",        "frotas.checklists"],
  ["/admin/checklist",         "frotas.checklist_new"],
  ["/admin/vehicles",          "frotas.veiculos"],
  ["/admin/drivers",           "frotas.motoristas"],
  ["/admin",                   "frotas.dashboard"],
];

function hasFrotasAccess(modules: string[]) {
  return modules.some((m) => m === "frotas" || m.startsWith("frotas."));
}

function AdminLayout() {
  const { user, isAdmin, isViewer, modules, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Navigate to="/" />;

  // /admin/usuarios is ERP-level management — accessible without frotas module
  const isUsuarios = path.startsWith("/admin/usuarios");

  // Admin/viewer entram sempre; os demais perfis precisam do módulo da área que estão a tentar abrir
  const hasRouteAccess = isUsuarios ? modules.includes("utilizadores") : hasFrotasAccess(modules);
  if (!isAdmin && !isViewer && !hasRouteAccess) return <Navigate to="/" />;

  if (isUsuarios) {
    // Utilizadores is now its own module — requires explicit grant
    if (!modules.includes("utilizadores")) return <Navigate to="/home" />;
  } else {
    // Module-level: requires at least one frotas screen slug
    if (!hasFrotasAccess(modules)) return <Navigate to="/home" />;

    // Screen-level: find matching guard for current path
    const legacy = modules.includes("frotas"); // old catch-all — skip per-screen check
    if (!legacy) {
      const matched = FROTAS_SCREEN_GUARDS.find(
        ([p]) => path === p || path.startsWith(p + "/")
      );
      if (matched) {
        const [, requiredSlug] = matched;
        if (!modules.includes(requiredSlug)) {
          // Redirect to first screen the user has access to
          const first = FROTAS_SCREEN_GUARDS.find(([, slug]) => modules.includes(slug));
          return <Navigate to={first ? first[0] : "/home"} />;
        }
      }
    }
  }

  return (
    <div className="min-h-screen flex w-full bg-background">
      <ERPSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
          <SidebarTrigger className="ml-2" />
          <div className="ml-3 flex items-center gap-1.5 text-sm">
            <span className="text-muted-foreground/60">ERP</span>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-semibold">Frotas</span>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}