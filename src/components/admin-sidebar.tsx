import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ClipboardList, Truck, Users, Wrench, LogOut, Home, ShieldCheck, UserCog, Trash2 } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

const items = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, exact: true, adminOnly: true },
  { title: "Histórico Geral", url: "/admin/checklists", icon: ClipboardList },
  { title: "Veículos", url: "/admin/vehicles", icon: Truck, adminOnly: true },
  { title: "Motoristas", url: "/admin/drivers", icon: Users, adminOnly: true },
  { title: "SMV / SMI", url: "/admin/maintenance", icon: Wrench, adminOnly: true },
  { title: "Lixeira", url: "/admin/maintenance/trash", icon: Trash2, adminOnly: true },
  { title: "Equipe / Acessos", url: "/admin/team", icon: UserCog, adminOnly: true },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { signOut, user, isAdmin } = useAuth();
  const isActive = (url: string, exact?: boolean) => exact ? path === url : path === url || path.startsWith(url + "/");
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 p-2">
          <img src={logoTomaz} alt="Grupo Tomaz" className="h-8 w-8 object-contain shrink-0" />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-bold text-sm truncate">Grupo Tomaz</div>
              <div className="text-[10px] text-sidebar-foreground/60 flex items-center gap-1"><ShieldCheck className="size-3" />Painel admin</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Gestão</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.filter((it) => !it.adminOnly || isAdmin).map((it) => (
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
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/" className="flex items-center gap-2">
                <Home className="size-4" />
                {!collapsed && <span>App do motorista</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut}>
              <LogOut className="size-4" />
              {!collapsed && <span className="truncate">Sair ({user?.email})</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}