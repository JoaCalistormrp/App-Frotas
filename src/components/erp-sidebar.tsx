import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home, Truck, TrendingDown, LayoutDashboard, ClipboardList, FilePlus,
  Wrench, Car, Users, UserCog, Trash2, LogOut, Building2, ShieldCheck,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter,
  SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

const ERP_MODULES = [
  { title: "Início",             url: "/home",            icon: Home,         exact: true,  slug: null,          adminOnly: false },
  { title: "Frotas",             url: "/admin",           icon: Truck,        exact: false, slug: "frotas",      adminOnly: false },
  { title: "Financeiro Frotas",  url: "/financeiro",      icon: TrendingDown, exact: true,  slug: "financeiro",  adminOnly: false },
  { title: "Usuários",           url: "/admin/usuarios",  icon: ShieldCheck,  exact: false, slug: "utilizadores", adminOnly: false },
] as const;

const FROTAS_ITEMS = [
  { title: "Dashboard",        url: "/admin",                   icon: LayoutDashboard, exact: true,  slug: "frotas.dashboard"     },
  { title: "Checklists",       url: "/admin/checklists",        icon: ClipboardList,   exact: false, slug: "frotas.checklists"    },
  { title: "Abrir Checklist",  url: "/admin/checklist",         icon: FilePlus,        exact: false, slug: "frotas.checklist_new" },
  { title: "Manutenção",       url: "/admin/maintenance",       icon: Wrench,          exact: false, slug: "frotas.manutencao"    },
  { title: "Veículos",         url: "/admin/vehicles",          icon: Car,             exact: false, slug: "frotas.veiculos"      },
  { title: "Motoristas",       url: "/admin/drivers",           icon: Users,           exact: false, slug: "frotas.motoristas"    },
  { title: "Lixeira",          url: "/admin/maintenance/trash", icon: Trash2,          exact: false, slug: "frotas.lixeira"       },
] as const;

export function ERPSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, user, isAdmin, modules } = useAuth();

  const isActive = (url: string, exact: boolean) =>
    exact ? path === url : path === url || path.startsWith(url + "/");

  // Módulos ERP — "Frotas" (/admin) não deve ficar activo em rotas ERP-level como /admin/usuarios
  const ERP_ONLY_PATHS = ["/admin/usuarios"];
  const isActiveMod = (url: string, exact: boolean) => {
    if (url === "/admin" && ERP_ONLY_PATHS.some((p) => path.startsWith(p))) return false;
    return isActive(url, exact);
  };

  const onFrotas = isActive("/admin", false) && !ERP_ONLY_PATHS.some((p) => path.startsWith(p));

  return (
    <Sidebar collapsible="icon">
      {/* ── Header ──────────────────────────────────────────── */}
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
        {/* ── Módulos ─────────────────────────────────────────── */}
        <SidebarGroup>
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ERP_MODULES.filter((m) => {
                if (m.adminOnly && !isAdmin) return false;
                if (!m.slug) return true;
                if (m.slug === "frotas") return modules.some((s) => s === "frotas" || s.startsWith("frotas."));
                return modules.includes(m.slug);
              }).map((mod) => (
                <SidebarMenuItem key={mod.url}>
                  <SidebarMenuButton asChild isActive={isActiveMod(mod.url, mod.exact)}>
                    <Link to={mod.url} className="flex items-center gap-2">
                      <mod.icon className="size-4" />
                      {!collapsed && <span>{mod.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* ── Sub-nav Frotas (só aparece dentro de /admin) ──── */}
        {onFrotas && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupLabel>Frotas</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {FROTAS_ITEMS.filter((it) => modules.includes(it.slug) || modules.includes("frotas")).map((it) => (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={isActive(it.url, it.exact)}>
                        <Link to={it.url} className="flex items-center gap-2">
                          <it.icon className="size-4" />
                          {!collapsed && <span>{it.title}</span>}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      {/* ── Footer ──────────────────────────────────────────── */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="text-destructive/80 hover:text-destructive">
              <LogOut className="size-4" />
              {!collapsed && <span className="truncate">Sair ({user?.email})</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
