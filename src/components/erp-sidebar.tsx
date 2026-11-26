import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarDays, ClipboardList, Home, LogOut, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  FROTAS_GROUPS, OTHER_MODULES, canAccessPage, canSeeModule, canSeePage, findActiveFrotasPage, hasFrotasModule, initials, isOsGestor, prettyName,
} from "@/lib/nav";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

// Faixa à esquerda + negrito marcam a página atual (não depende só da cor de fundo)
const ACTIVE_ITEM =
  "relative before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-sidebar-primary " +
  "before:opacity-0 data-[active=true]:before:opacity-100 data-[active=true]:font-semibold " +
  "group-data-[collapsible=icon]:before:hidden";

function NavItem({ url, title, icon: Icon, active, badge, badgeLabel, onNavigate }: {
  url: string; title: string; icon: LucideIcon; active: boolean; badge?: number; badgeLabel?: string; onNavigate: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active} tooltip={badge ? `${title} · ${badge} ${badgeLabel ?? ""}`.trim() : title} className={ACTIVE_ITEM}>
        <Link to={url as never} onClick={onNavigate} aria-current={active ? "page" : undefined}>
          <Icon />
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
      {!!badge && (
        <SidebarMenuBadge className="bg-amber-500/15 text-amber-700 dark:text-amber-400" aria-label={`${badge} ${badgeLabel ?? ""}`}>
          {badge}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

// Pedidos de peça do mecânico que o Frotas ADM ainda não respondeu
function usePendingPartRequests(enabled: boolean, path: string) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!enabled) { setCount(0); return; }
    let alive = true;
    supabase
      .from("maintenance_orders")
      .select("id", { count: "exact", head: true })
      .eq("order_type", "SMI")
      .eq("status", "aguardando_pecas")
      .is("part_decided_at", null)
      .is("deleted_at", null)
      .then(({ count: c }) => { if (alive) setCount(c ?? 0); });
    return () => { alive = false; };
  }, [enabled, path]);
  return count;
}

export function ERPSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, user, fullName, isAdmin, isMaster, isViewer, isFieldDriver, isMechanic, modules } = useAuth();

  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const activeUrl = findActiveFrotasPage(path)?.url ?? null;

  const fieldMode = isFieldDriver || isMechanic;
  const awaiting = usePendingPartRequests(isOsGestor(modules, isAdmin) && !fieldMode, path);

  const groups = hasFrotasModule(modules)
    ? FROTAS_GROUPS.map((g) => ({ ...g, pages: g.pages.filter((p) => canSeePage(modules, p)) })).filter((g) => g.pages.length)
    : [];
  const pageCount = groups.reduce((n, g) => n + g.pages.length, 0);
  const showGroupLabels = pageCount > 4;
  const others = OTHER_MODULES.filter((m) => canSeeModule(m, modules, isAdmin));

  const name = prettyName(fullName) ?? user?.email ?? "Usuário";
  const mechanicByModule = canAccessPage(modules, "frotas.os_mecanico") && !isOsGestor(modules, isAdmin);
  const roleLabel = isMaster ? "Master" : isAdmin ? "Administrador" : isViewer ? "Consulta" : isMechanic || mechanicByModule ? "Mecânico" : fieldMode ? "Motorista" : "Geral";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          to={(fieldMode ? "/motorista" : "/home") as never}
          onClick={closeMobile}
          className="flex items-center gap-2.5 rounded-md p-1.5 outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label="Grupo Tomaz — ir para o início"
        >
          <img src={logoTomaz} alt="" className="size-8 shrink-0 object-contain" />
          {!collapsed && (
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-sm font-bold">Grupo Tomaz</span>
              <span className="block text-[11px] text-sidebar-foreground/60">Sistema ERP</span>
            </span>
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {fieldMode ? (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem url="/motorista" title="Checklist diário" icon={ClipboardList} active={path === "/motorista"} onNavigate={closeMobile} />
                {canAccessPage(modules, "frotas.agendamento") && (
                  <NavItem url="/admin/agendamento" title="Agendamento" icon={CalendarDays} active={activeUrl === "/admin/agendamento"} onNavigate={closeMobile} />
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          <>
            <SidebarGroup className="pb-0">
              <SidebarMenu>
                <NavItem url="/home" title="Início" icon={Home} active={path === "/home"} onNavigate={closeMobile} />
              </SidebarMenu>
            </SidebarGroup>

            {groups.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="gap-2 text-xs font-semibold text-sidebar-foreground/80">
                  <Truck />Frotas
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  {groups.map((g) => (
                    <div key={g.label ?? "visao-geral"}>
                      {showGroupLabels && g.label && (
                        <div className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden">
                          {g.label}
                        </div>
                      )}
                      <SidebarMenu>
                        {g.pages.map((p) => (
                          <NavItem
                            key={p.url}
                            url={p.url}
                            title={p.title}
                            icon={p.icon}
                            active={activeUrl === p.url}
                            badge={p.url === "/admin/maintenance" ? awaiting : undefined}
                            badgeLabel="pedido(s) de peça aguardando resposta"
                            onNavigate={closeMobile}
                          />
                        ))}
                      </SidebarMenu>
                    </div>
                  ))}
                </SidebarGroupContent>
              </SidebarGroup>
            )}

            {others.length > 0 && (
              <SidebarGroup>
                <SidebarGroupLabel className="text-xs font-semibold text-sidebar-foreground/80">Outros módulos</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {others.map((m) => (
                      <NavItem
                        key={m.url}
                        url={m.url}
                        title={m.title}
                        icon={m.icon}
                        active={path === m.url || path.startsWith(m.url + "/")}
                        onNavigate={closeMobile}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )}
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className={cn("flex items-center gap-2 rounded-md p-1", collapsed && "flex-col p-0")}>
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full bg-sidebar-primary text-[11px] font-bold text-sidebar-primary-foreground"
            title={`${name} · ${roleLabel}`}
            aria-hidden
          >
            {initials(name)}
          </span>
          {!collapsed && (
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium">{name}</span>
              <span className="block truncate text-[11px] text-sidebar-foreground/60">{roleLabel}</span>
            </span>
          )}
          <button
            type="button"
            onClick={signOut}
            title="Sair"
            aria-label="Sair do sistema"
            className="grid size-8 shrink-0 place-items-center rounded-md text-sidebar-foreground/60 outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
