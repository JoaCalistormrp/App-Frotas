import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ERPSidebar } from "@/components/erp-sidebar";
import { AppHeader } from "@/components/app-header";
import { ALL_FROTAS_PAGES, canAccessPage, hasFrotasModule, prettyName } from "@/lib/nav";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Truck, TrendingDown, ShieldCheck, ArrowRight, Building2, Bell, BellOff, BellRing, Gavel } from "lucide-react";
import { registerPushForMaster } from "@/lib/push";

export const Route = createFileRoute("/home")({
  component: ERPHome,
});

const ALL_MODULES = [
  {
    slug: "frotas",
    title: "Frotas",
    description: "Gestão de veículos, checklists diários, manutenção preventiva e motoristas.",
    url: "/admin",
    icon: Truck,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-600",
    badge: "Ativo",
    badgeBg: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    slug: "financeiro",
    title: "Financeiro Frotas",
    description: "Análise de despesas e custos operacionais da frota. Integração com base de dados financeira.",
    url: "/financeiro",
    icon: TrendingDown,
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600",
    badge: "Ativo",
    badgeBg: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    slug: "utilizadores",
    title: "Usuários",
    description: "Gestão de utilizadores, perfis e módulos de acesso do ERP.",
    url: "/admin/usuarios",
    icon: ShieldCheck,
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600",
    badge: "Ativo",
    badgeBg: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  {
    slug: "licitacao",
    title: "Licitações",
    description: "Acompanhamento de licitações em curso — kanban por status, vencimentos e contratos.",
    url: "/licitacao",
    icon: Gavel,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600",
    badge: "Ativo",
    badgeBg: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
];

function NotificationToggle({ userId }: { userId: string }) {
  const [perm, setPerm] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);

  const activate = async () => {
    setBusy(true);
    await registerPushForMaster(userId);
    if ("Notification" in window) setPerm(Notification.permission);
    setBusy(false);
  };

  if (!("Notification" in window) || !("serviceWorker" in navigator)) return null;

  if (perm === "granted") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 px-2">
        <BellRing className="size-3.5" />
        <span className="hidden sm:inline">Notificações ativas</span>
      </div>
    );
  }
  if (perm === "denied") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2" title="Notificações bloqueadas — altere nas definições do browser">
        <BellOff className="size-3.5" />
        <span className="hidden sm:inline">Bloqueadas no browser</span>
      </div>
    );
  }
  return (
    <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={activate} disabled={busy}>
      <Bell className="size-3.5" />
      {busy ? "A ativar…" : "Ativar notificações"}
    </Button>
  );
}

// Atalhos para as tarefas mais comuns, na ordem de uso; cada pessoa vê só o que pode abrir
const QUICK_ACCESS: Array<{ url: string; desc: string }> = [
  { url: "/admin/checklist", desc: "Inspeção diária de um veículo" },
  { url: "/admin/maintenance", desc: "Abrir e acompanhar OS" },
  { url: "/admin", desc: "Resumo do dia da frota" },
  { url: "/admin/agendamento", desc: "Reservas e serviços na agenda" },
  { url: "/admin/checklists", desc: "Todos os checklists enviados" },
  { url: "/admin/vehicles", desc: "Cadastro e documentos" },
  { url: "/admin/drivers", desc: "CNH e dados dos motoristas" },
];

function ERPHome() {
  const { user, fullName, isAdmin, isViewer, isMechanic, isDriver, isFieldDriver, modules, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Carregando…
      </div>
    );
  }
  if (!user) return <Navigate to="/" />;
  if (isMechanic || isFieldDriver) return <Navigate to="/motorista" />;
  // Geral com acesso amplo de Frotas (não só checklist) vê o Início normalmente
  if (!isAdmin && !isViewer && !isDriver) return <Navigate to="/" />;

  const visibleModules = ALL_MODULES.filter((m) =>
    m.slug === "frotas"
      ? hasFrotasModule(modules)
      : m.slug === "licitacao"
        ? isAdmin || modules.includes(m.slug)
        : modules.includes(m.slug)
  );
  const quick = hasFrotasModule(modules)
    ? QUICK_ACCESS.map((q) => ({ ...q, page: ALL_FROTAS_PAGES.find((p) => p.url === q.url) }))
        .filter((q): q is typeof q & { page: NonNullable<typeof q.page> } => !!q.page && canAccessPage(modules, q.page.slug))
        .slice(0, 6)
    : [];
  const firstName = prettyName(fullName)?.split(" ")[0] ?? null;

  return (
    <div className="min-h-screen flex w-full bg-background">
      <ERPSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <AppHeader actions={isAdmin && user ? <NotificationToggle userId={user.id} /> : undefined} />

          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <div className="max-w-3xl mx-auto space-y-8">

              <div className="flex items-center gap-4 pt-2">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Building2 className="size-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold leading-tight">
                    {firstName ? `Olá, ${firstName}` : "Olá"}
                  </h1>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    {quick.length ? "O que você quer fazer agora?" : "Selecione um módulo para começar"}
                  </p>
                </div>
              </div>

              {quick.length > 0 && (
                <section aria-labelledby="acesso-rapido">
                  <h2 id="acesso-rapido" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Acesso rápido
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {quick.map((q) => (
                      <Link to={q.url as never} key={q.url} className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Card className="p-4 flex items-center gap-3 h-full transition-colors group-hover:border-primary/40 group-hover:bg-muted/30">
                          <span className="size-10 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0">
                            <q.page.icon className="size-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">{q.page.title}</span>
                            <span className="block text-xs text-muted-foreground truncate">{q.desc}</span>
                          </span>
                          <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-primary shrink-0 transition-colors" />
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              )}

              {(visibleModules.length > 1 || quick.length === 0) && (
              <section>
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Módulos disponíveis
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visibleModules.map((mod) => (
                    <Link to={mod.url} key={mod.url} className="group">
                      <Card className="p-5 flex items-start gap-4 hover:border-primary/40 hover:shadow-sm transition-all duration-200 cursor-pointer">
                        <div
                          className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${mod.iconBg}`}
                        >
                          <mod.icon className={`size-6 ${mod.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-bold text-sm">{mod.title}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${mod.badgeBg}`}>
                              {mod.badge}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {mod.description}
                          </p>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-1 transition-colors" />
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
              )}
            </div>
          </main>
        </div>
    </div>
  );
}
