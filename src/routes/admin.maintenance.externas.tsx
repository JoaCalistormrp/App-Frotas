import { createFileRoute } from "@tanstack/react-router";
import { OsListPage } from "@/components/os-list-page";

export const Route = createFileRoute("/admin/maintenance/externas")({ component: () => <OsListPage kind="SMV" /> });
