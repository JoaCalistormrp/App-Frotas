import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { OsListPage } from "@/components/os-list-page";

export const Route = createFileRoute("/admin/maintenance")({ component: MaintenancePage });

function MaintenancePage() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isChild = path.startsWith("/admin/maintenance/") && path !== "/admin/maintenance/";
  if (isChild) return <Outlet />;
  return <OsListPage kind="SMI" />;
}
