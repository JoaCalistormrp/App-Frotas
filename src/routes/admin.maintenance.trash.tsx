import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RefreshCcw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/maintenance/trash")({ component: TrashPage });

type DeletedOrder = {
  id: string; order_number: string; order_type: string; base_code: string;
  deleted_at: string; delete_reason: string | null; deleted_by: string | null;
  vehicles?: { plate: string | null; model: string | null } | null;
  deleter?: { full_name: string | null } | null;
};

function TrashPage() {
  const { isAdmin } = useAuth();
  const [orders, setOrders] = useState<DeletedOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    // Busca TODAS as ordens que POSSUEM uma data de exclusão
    const { data, error } = await supabase
      .from("maintenance_orders")
      .select("id, order_number, order_type, base_code, deleted_at, delete_reason, deleted_by, vehicles(plate, model)")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });

    if (error) { toast.error(error.message); setLoading(false); return; }

    const rows = (data ?? []) as any[];
    const userIds = Array.from(new Set(rows.map(r => r.deleted_by).filter(Boolean)));
    let userMap: Record<string, string> = {};
    
    if (userIds.length > 0) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        userMap = Object.fromEntries((profs ?? []).map(p => [p.id, p.full_name ?? "—"]));
    }

    setOrders(rows.map(r => ({ ...r, deleter: { full_name: userMap[r.deleted_by] ?? null } })));
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const restore = async (id: string, number: string) => {
    if (!confirm(`Deseja restaurar a OS ${number}? Ela voltará para o painel principal.`)) return;
    const { error } = await supabase.from("maintenance_orders").update({ deleted_at: null, deleted_by: null, delete_reason: null } as never).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`OS ${number} restaurada!`);
    load();
  };

  const hardDelete = async (id: string, number: string) => {
    if (!confirm(`ATENÇÃO: Deseja EXCLUIR DEFINITIVAMENTE a OS ${number}? Essa ação é irreversível e apagará a ordem permanentemente do banco de dados.`)) return;
    
    // Exclusão definitiva (Hard Delete)
    const { error } = await supabase.from("maintenance_orders").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir: " + error.message); return; }
    
    toast.success(`OS ${number} excluída permanentemente.`);
    load();
  };

  if (!isAdmin) return <div className="p-10 text-center text-muted-foreground">Acesso negado.</div>;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/admin/maintenance"><Button size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="size-6 text-destructive" />Lixeira de OS</h1>
          <p className="text-sm text-muted-foreground">Histórico de Ordens de Serviço excluídas.</p>
        </div>
      </div>

      {loading && <Card className="p-6 text-center text-muted-foreground text-sm">Carregando lixeira...</Card>}
      {!loading && orders.length === 0 && <Card className="p-6 text-center text-muted-foreground text-sm">A lixeira está vazia.</Card>}
      
      <div className="space-y-3">
        {orders.map(o => (
          <Card key={o.id} className="p-4 border-l-4 border-l-destructive flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="font-bold text-lg">{o.order_number} <span className="text-xs uppercase bg-secondary px-2 py-0.5 rounded ml-2">{o.order_type}</span></div>
              <div className="text-sm">Veículo: {o.vehicles?.plate ?? "—"} {o.vehicles?.model ? `• ${o.vehicles.model}` : ""}</div>
              <div className="text-xs text-muted-foreground mt-2 flex flex-col gap-1">
                <span><strong>Excluída em:</strong> {new Date(o.deleted_at).toLocaleString("pt-BR")}</span>
                <span><strong>Por:</strong> {o.deleter?.full_name ?? "Usuário desconhecido"}</span>
                <span className="text-destructive"><strong>Motivo:</strong> {o.delete_reason ?? "Não informado"}</span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-2">
              <Button size="sm" variant="outline" onClick={() => restore(o.id, o.order_number)}>
                <RefreshCcw className="size-4 mr-2" />Restaurar
              </Button>
              <Button size="sm" variant="destructive" onClick={() => hardDelete(o.id, o.order_number)}>
                <AlertTriangle className="size-4 mr-2" />Excluir Definitivamente
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}