import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, RotateCcw, AlertTriangle, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/maintenance/trash")({ component: TrashPage });

type DeletedOrder = {
  id: string; order_number: string; order_type: string; base_code: string;
  failure_description: string | null; workshop: string | null;
  created_at: string; deleted_at: string; deleted_by: string | null; delete_reason: string | null;
  vehicle_id: string | null;
};

function TrashPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<DeletedOrder[]>([]);
  const [vehicles, setVehicles] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fPlate, setFPlate] = useState("");
  const [fNumber, setFNumber] = useState("");
  const [fUser, setFUser] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("maintenance_orders")
      .select("id, order_number, order_type, base_code, failure_description, workshop, created_at, deleted_at, deleted_by, delete_reason, vehicle_id")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const list = (data ?? []) as DeletedOrder[];
    setRows(list);
    const vIds = Array.from(new Set(list.map((r) => r.vehicle_id).filter(Boolean) as string[]));
    const uIds = Array.from(new Set(list.map((r) => r.deleted_by).filter(Boolean) as string[]));
    if (vIds.length) {
      const { data: vs } = await supabase.from("vehicles").select("id, plate").in("id", vIds);
      setVehicles(Object.fromEntries((vs ?? []).map((v) => [v.id, v.plate])));
    }
    if (uIds.length) {
      const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", uIds);
      setUsers(Object.fromEntries((ps ?? []).map((p) => [p.id, p.full_name ?? "—"])));
    }
    setLoading(false);
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (fNumber && !r.order_number.toLowerCase().includes(fNumber.toLowerCase())) return false;
    if (fPlate) { const p = r.vehicle_id ? vehicles[r.vehicle_id] ?? "" : ""; if (!p.toLowerCase().includes(fPlate.toLowerCase())) return false; }
    if (fUser) { const n = r.deleted_by ? users[r.deleted_by] ?? "" : ""; if (!n.toLowerCase().includes(fUser.toLowerCase())) return false; }
    if (fFrom && r.deleted_at < fFrom) return false;
    if (fTo && r.deleted_at > fTo + "T23:59:59") return false;
    return true;
  }), [rows, vehicles, users, fNumber, fPlate, fUser, fFrom, fTo]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const restore = async (r: DeletedOrder) => {
    if (!confirm(`Restaurar a OS ${r.order_number}?`)) return;
    const { error } = await supabase
      .from("maintenance_orders")
      .update({ deleted_at: null, deleted_by: null, delete_reason: null } as never)
      .eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("OS restaurada");
    load();
  };

  const purge = async (r: DeletedOrder) => {
    if (!confirm(`EXCLUIR DEFINITIVAMENTE a OS ${r.order_number}? Esta ação é IRREVERSÍVEL.`)) return;
    const second = prompt(`Digite "EXCLUIR" para confirmar a exclusão definitiva da OS ${r.order_number}:`);
    if (second !== "EXCLUIR") { toast.error("Confirmação incorreta. Operação cancelada."); return; }
    const { error } = await supabase.from("maintenance_orders").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("OS excluída definitivamente");
    load();
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <Link to="/admin/maintenance"><Button size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Trash2 className="size-6" />Lixeira de Ordens</h1>
          <p className="text-sm text-muted-foreground">OSs excluídas — restaure ou exclua definitivamente</p>
        </div>
      </div>

      <Card className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <div><Label className="text-xs">Nº OS</Label><Input value={fNumber} onChange={(e) => setFNumber(e.target.value)} placeholder="OS01_VOT" /></div>
        <div><Label className="text-xs">Placa</Label><Input value={fPlate} onChange={(e) => setFPlate(e.target.value)} /></div>
        <div><Label className="text-xs">Usuário</Label><Input value={fUser} onChange={(e) => setFUser(e.target.value)} placeholder="quem excluiu" /></div>
        <div><Label className="text-xs">De</Label><Input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} /></div>
        <div><Label className="text-xs">Até</Label><Input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} /></div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{filtered.length} ordem(ns) na lixeira</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-sm text-muted-foreground py-6 text-center">Nenhuma OS excluída encontrada.</div>
        )}
        <div className="divide-y divide-border">
          {filtered.map((r) => (
            <div key={r.id} className="py-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold">{r.order_number} <span className="text-xs font-normal ml-1 bg-primary/10 text-primary px-2 py-0.5 rounded">{r.order_type}</span></div>
                <div className="text-xs text-muted-foreground truncate">
                  Placa: {r.vehicle_id ? vehicles[r.vehicle_id] ?? "—" : "—"}
                  {" • Excluída em "}{new Date(r.deleted_at).toLocaleString("pt-BR")}
                  {" • Por "}{r.deleted_by ? users[r.deleted_by] ?? "—" : "—"}
                </div>
                {r.delete_reason && (
                  <div className="text-xs mt-1 flex items-start gap-1 text-amber-600">
                    <AlertTriangle className="size-3 mt-0.5 shrink-0" /><span>Motivo: {r.delete_reason}</span>
                  </div>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => restore(r)}><RotateCcw className="size-3" />Restaurar</Button>
                <Button size="sm" variant="destructive" onClick={() => purge(r)}><Trash2 className="size-3" />Excluir definitivamente</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}