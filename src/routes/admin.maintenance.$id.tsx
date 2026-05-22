import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, FileDown, Save } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding, BASE_CODES } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin/maintenance/$id")({ component: OrderForm });

type Order = {
  id?: string; order_number?: string; order_type: "SMI" | "SMV"; base_code: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  failure_description: string; service_type: string; workshop: string;
  status: "pendente" | "em_manutencao" | "solucionado"; observations: string;
};

function OrderForm() {
  const { id } = useParams({ from: "/admin/maintenance/$id" });
  const nav = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";
  const [order, setOrder] = useState<Order>({
    order_type: "SMI", base_code: "VOT", vehicle_id: null, driver_id: null, checklist_id: null,
    failure_description: "", service_type: "", workshop: "", status: "pendente", observations: "",
  });
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    const [{ data: vs }, { data: ds }] = await Promise.all([
      supabase.from("vehicles").select("id, plate").order("plate"),
      supabase.from("profiles").select("id, full_name").order("full_name"),
    ]);
    setVehicles((vs ?? []) as never); setDrivers((ds ?? []) as never);
    if (!isNew) {
      const { data } = await (supabase.from as never as (t: string) => { select: (s: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: Order & { order_number: string } | null }> } } })("maintenance_orders").select("*").eq("id", id).single();
      if (data) { setOrder(data as Order); setOrderNumber(data.order_number); }
    }
  })(); }, [id, isNew]);

  const save = async () => {
    setBusy(true);
    try {
      const t = supabase.from as never as (t: string) => { insert: (p: object) => { select: (s: string) => { single: () => Promise<{ data: { id: string; order_number: string } | null; error: { message: string } | null }> } }; update: (p: object) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } };
      if (isNew) {
        const { data: num, error: ne } = await supabase.rpc("next_order_number", { _base: order.base_code }) as never as { data: string | null; error: { message: string } | null };
        if (ne) throw new Error(ne.message);
        const payload = { ...order, order_number: num, created_by: user?.id };
        const { data, error } = await t("maintenance_orders").insert(payload).select("id, order_number").single();
        if (error) throw new Error(error.message);
        toast.success(`Ordem ${data?.order_number} criada`);
        if (data?.id) nav({ to: "/admin/maintenance/$id", params: { id: data.id } });
      } else {
        const { error } = await t("maintenance_orders").update(order).eq("id", id);
        if (error) throw new Error(error.message);
        toast.success("Atualizada");
      }
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const exportPdf = async () => {
    const doc = new jsPDF();
    const veh = vehicles.find((v) => v.id === order.vehicle_id);
    const drv = drivers.find((d) => d.id === order.driver_id);
    await applyPdfBranding(doc, `${order.order_type} - ${orderNumber ?? "(nova)"}`, `Status: ${order.status}`);
    autoTable(doc, {
      startY: 36,
      head: [["Campo", "Valor"]],
      body: [
        ["Número", orderNumber ?? "—"], ["Tipo", order.order_type], ["Base", order.base_code],
        ["Data", new Date().toLocaleString("pt-BR")],
        ["Veículo / Placa", veh?.plate ?? "—"], ["Motorista", drv?.full_name ?? "—"],
        ["Descrição da falha", order.failure_description || "—"],
        ["Tipo de manutenção", order.service_type || "—"], ["Oficina", order.workshop || "—"],
        ["Observações", order.observations || "—"],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 40, 80] },
    });
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
    doc.setFontSize(9);
    doc.line(20, finalY, 90, finalY); doc.text("Assinatura do mecânico", 30, finalY + 5);
    doc.line(120, finalY, 190, finalY); doc.text("Assinatura do responsável", 130, finalY + 5);
    doc.text(`Data: ____ / ____ / ________`, 20, finalY + 20);
    doc.save(`${order.order_type}_${orderNumber ?? "nova"}.pdf`);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/admin/maintenance"><Button size="icon" variant="ghost"><ArrowLeft className="size-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">{isNew ? "Nova ordem" : `Ordem ${orderNumber ?? ""}`}</h1>
            <p className="text-sm text-muted-foreground">SMI = manutenção interna • SMV = manutenção externa</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isNew && <Button variant="outline" onClick={exportPdf}><FileDown className="size-4" />PDF</Button>}
          <Button onClick={save} disabled={busy}><Save className="size-4" />{busy ? "..." : "Salvar"}</Button>
        </div>
      </div>

      <Card className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
        <div><Label className="text-xs">Tipo *</Label>
          <select value={order.order_type} onChange={(e) => setOrder({ ...order, order_type: e.target.value as "SMI" | "SMV" })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="SMI">SMI — Interna</option><option value="SMV">SMV — Externa</option>
          </select>
        </div>
        <div><Label className="text-xs">Base *</Label>
          <select value={order.base_code} onChange={(e) => setOrder({ ...order, base_code: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm" disabled={!isNew}>
            {BASE_CODES.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.label}</option>)}
          </select>
        </div>
        <div><Label className="text-xs">Status</Label>
          <select value={order.status} onChange={(e) => setOrder({ ...order, status: e.target.value as never })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="pendente">Pendente</option><option value="em_manutencao">Em manutenção</option><option value="solucionado">Solucionado</option>
          </select>
        </div>
        <div><Label className="text-xs">Veículo</Label>
          <select value={order.vehicle_id ?? ""} onChange={(e) => setOrder({ ...order, vehicle_id: e.target.value || null })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}
          </select>
        </div>
        <div className="md:col-span-2"><Label className="text-xs">Motorista</Label>
          <select value={order.driver_id ?? ""} onChange={(e) => setOrder({ ...order, driver_id: e.target.value || null })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0,8)}</option>)}
          </select>
        </div>
        <div className="md:col-span-3"><Label className="text-xs">Descrição da falha</Label><Textarea rows={3} value={order.failure_description} onChange={(e) => setOrder({ ...order, failure_description: e.target.value })} /></div>
        <div><Label className="text-xs">Tipo de manutenção</Label><Input value={order.service_type} onChange={(e) => setOrder({ ...order, service_type: e.target.value })} placeholder="Ex.: corretiva, preventiva" /></div>
        <div className="md:col-span-2"><Label className="text-xs">Oficina responsável</Label><Input value={order.workshop} onChange={(e) => setOrder({ ...order, workshop: e.target.value })} /></div>
        <div className="md:col-span-3"><Label className="text-xs">Observações</Label><Textarea rows={3} value={order.observations} onChange={(e) => setOrder({ ...order, observations: e.target.value })} /></div>
      </Card>

      {!isNew && (
        <Card className="p-5">
          <div className="font-semibold mb-2">Assinaturas</div>
          <p className="text-xs text-muted-foreground">As assinaturas (mecânico e responsável) aparecem no PDF gerado, com campo de data ao final do documento.</p>
        </Card>
      )}
    </div>
  );
}