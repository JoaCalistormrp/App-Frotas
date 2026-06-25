import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Home, Truck, TrendingDown, LayoutDashboard, ClipboardList, FilePlus,
  Wrench, Car, Users, Trash2, LogOut, Building2, ShieldCheck, ChevronDown, Gavel,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

type NavPage = {
  title: string; url: string; icon: React.ElementType; exact: boolean; slug: string;
};
type NavModule = {
  title: string; url: string; icon: React.ElementType; exact: boolean;
  slug: string | null; adminOnly: boolean; pages: NavPage[];
};

const NAV: NavModule[] = [
  {
    title: "Início", url: "/home", icon: Home, exact: true,
    slug: null, adminOnly: false, pages: [],
  },
  {
    title: "Frotas", url: "/admin", icon: Truck, exact: false,
    slug: "frotas", adminOnly: false, pages: [
      { title: "Dashboard",       url: "/admin",                   icon: LayoutDashboard, exact: true,  slug: "frotas.dashboard"     },
      { title: "Checklists",      url: "/admin/checklists",        icon: ClipboardList,   exact: false, slug: "frotas.checklists"    },
      { title: "Abrir Checklist", url: "/admin/checklist",         icon: FilePlus,        exact: false, slug: "frotas.checklist_new" },
      { title: "Manutenção",      url: "/admin/maintenance",       icon: Wrench,          exact: false, slug: "frotas.manutencao"    },
      { title: "Veículos",        url: "/admin/vehicles",          icon: Car,             exact: false, slug: "frotas.veiculos"      },
      { title: "Motoristas",      url: "/admin/drivers",           icon: Users,           exact: false, slug: "frotas.motoristas"    },
      { title: "Lixeira",         url: "/admin/maintenance/trash", icon: Trash2,          exact: false, slug: "frotas.lixeira"       },
    ],
  },
  {
    title: "Financeiro Frotas", url: "/financeiro", icon: TrendingDown, exact: true,
    slug: "financeiro", adminOnly: false, pages: [],
  },
  {
    title: "Licitações", url: "/licitacao", icon: Gavel, exact: false,
    slug: null, adminOnly: true, pages: [],
  },
  {
    title: "Usuários", url: "/admin/usuarios", icon: ShieldCheck, exact: false,
    slug: "utilizadores", adminOnly: false, pages: [],
  },
];

export function ERPSidebar() {
  const navigate = useNavigate();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, user, isAdmin, isDriver, isMechanic, modules } = useAuth();

  const isActive = (url: string, exact: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  const canSeeModule = (mod: NavModule) => {
    if (mod.adminOnly && !isAdmin) return false;
    if (!mod.slug) return true;
    if (mod.slug === "frotas") return modules.some((s) => s === "frotas" || s.startsWith("frotas."));
    return modules.includes(mod.slug);
  };

  const canSeePage = (page: NavPage) =>
    modules.includes(page.slug) || modules.includes("frotas");

  const findActiveModule = () =>
    NAV.find((m) => m.pages.length > 0 && m.pages.some((p) => isActive(p.url, p.exact)))?.url ?? null;

  const [expanded, setExpanded] = useState<string | null>(findActiveModule);

  useEffect(() => {
    const active = findActiveModule();
    if (active) setExpanded(active);
  }, [path]);

  const go = (url: string) => navigate({ to: url as Parameters<typeof navigate>[0]["to"] });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 p-2">
          <img src={logoTomaz} alt="Grupo Tomaz" className="h-8 w-8 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">Grupo Tomaz</div>
              <div className="text-[10px] text-sidebar-foreground/60 flex items-center gap-1">
                <Building2 className="size-3" /> Sistema ERP
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.filter(canSeeModule).map((mod) => {
                const hasPages = mod.pages.length > 0;
                const isExpanded = expanded === mod.url && !collapsed;
                const visiblePages = hasPages ? mod.pages.filter(canSeePage) : [];
                const modActive = hasPages
                  ? visiblePages.some((p) => isActive(p.url, p.exact))
                  : isActive(mod.url, mod.exact);

                return (
                  <SidebarMenuItem key={mod.url}>
                    <SidebarMenuButton
                      isActive={modActive}
                      onClick={() => {
                        if (hasPages && !collapsed) {
                          setExpanded(isExpanded ? null : mod.url);
                        } else {
                          go(mod.url);
                        }
                      }}
                      className="justify-between"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <mod.icon className="size-4 shrink-0" />
                        {!collapsed && <span className="truncate">{mod.title}</span>}
                      </span>
                      {hasPages && !collapsed && (
                        <ChevronDown
                          className={`size-3.5 shrink-0 transition-transform text-sidebar-foreground/40 ${isExpanded ? "rotate-0" : "-rotate-90"}`}
                        />
                      )}
                    </SidebarMenuButton>

                    {isExpanded && visiblePages.length > 0 && (
                      <SidebarMenuSub>
                        {visiblePages.map((page) => (
                          <SidebarMenuSubItem key={page.url}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive(page.url, page.exact)}
                            >
                              <button
                                type="button"
                                onClick={() => go(page.url)}
                                className="w-full flex items-center gap-2"
                              >
                                <page.icon className="size-4 shrink-0" />
                                <span>{page.title}</span>
                              </button>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenuItem>
                );
              })}

              {(isDriver || isMechanic) && modules.some((s) => s === "frotas" || s.startsWith("frotas.")) && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={path === "/motorista"}
                    onClick={() => go("/motorista")}
                  >
                    <ClipboardList className="size-4 shrink-0" />
                    {!collapsed && <span>{isMechanic ? "Checklist (Mecânico)" : "Checklist Diário"}</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-destructive/80 hover:text-destructive">
              <LogOut className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">Sair ({user?.email})</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
