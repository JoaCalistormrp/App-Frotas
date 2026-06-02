import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/maintenance")({ component: MaintenancePage });

type Order = {
  id: string; order_number: string; order_type: string; base_code: string; status: string;
  failure_description: string | null; workshop: string | null; created_at: string;
  vehicle_id: string | null;
};

function MaintenancePage() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [list, setList] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("maintenance_orders")
      .select("id, order_number, order_type, base_code, status, failure_description, workshop, created_at, vehicle_id")
      .order("created_at", { ascending: false });
    if (error) toast.error("Erro ao carregar ordens: " + error.message);
    setList((data ?? []) as Order[]);
    setLoading(false);
  })(); }, []);

  if (path.startsWith("/admin/maintenance/") && path !== "/admin/maintenance/") {
    return <Outlet />;
  }

  const tone = (s: string) => s === "solucionado" ? "text-green-600" : s === "em_manutencao" ? "text-amber-600" : "text-destructive";

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="size-6" />SMV / SMI</h1>
          <p className="text-sm text-muted-foreground">Ordens de manutenção interna (SMI) e externa (SMV)</p>
        </div>
        <Link to="/admin/maintenance/$id" params={{ id: "new" }}>
          <Button><Plus className="size-4" />Nova ordem</Button>
        </Link>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{list.length} ordem(ns)</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!loading && list.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Nenhuma ordem ainda. Clique em "Nova ordem" ou abra a partir de um checklist com falhas.
          </div>
        )}
        <div className="divide-y divide-border">
          {list.map((o) => (
            <Link key={o.id} to="/admin/maintenance/$id" params={{ id: o.id }} className="py-3 flex items-center gap-2 text-sm hover:bg-muted/30 px-2 rounded">
              <div className="flex-1 min-w-0">
                <div className="font-bold">{o.order_number} <span className="text-xs font-normal ml-1 bg-primary/10 text-primary px-2 py-0.5 rounded">{o.order_type}</span></div>
                <div className="text-xs text-muted-foreground truncate">{o.failure_description ?? "—"}{o.workshop ? ` • ${o.workshop}` : ""}</div>
              </div>
              <span className={`text-xs font-semibold shrink-0 ${tone(o.status)}`}>{o.status.replace("_", " ")}</span>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}