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
  maintenance_category?: string; validade_oleo?: string; km_atual?: number | null;
  combustivel_chegada?: string; data_entrada?: string; hora_entrada?: string;
  data_saida?: string; hora_saida?: string; mod_carro?: string;
  solution_description?: string; items_replaced?: string;
};

function OrderForm() {
  const { id } = useParams({ from: "/admin/maintenance/$id" });
  const nav = useNavigate();
  const { user } = useAuth();
  const isNew = id === "new";
  const [order, setOrder] = useState<Order>({
    order_type: "SMI", base_code: "VOT", vehicle_id: null, driver_id: null, checklist_id: null,
    failure_description: "", service_type: "", workshop: "", status: "pendente", observations: "",
    maintenance_category: "corretiva", validade_oleo: "", km_atual: null,
    combustivel_chegada: "", data_entrada: "", hora_entrada: "",
    data_saida: "", hora_saida: "", mod_carro: "", solution_description: "", items_replaced: "",
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
    const fullTitle = order.order_type === "SMI" ? "SOLICITAÇÃO DE MANUTENÇÃO INTERNA" : "SOLICITAÇÃO DE MANUTENÇÃO VEICULAR";
    await applyPdfBranding(doc, `${order.order_type} — ${fullTitle}`, `Nº ${orderNumber ?? "(nova)"} • Status: ${order.status}`);
    // Categoria
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("TIPO DE MANUTENÇÃO:", 14, 36);
    doc.setFont("helvetica", "normal");
    const cats = ["corretiva", "preventiva", "planejada"] as const;
    cats.forEach((c, i) => {
      const x = 60 + i * 45;
      doc.rect(x, 32, 4, 4);
      if (order.maintenance_category === c) { doc.setFillColor(0, 0, 0); doc.rect(x + 0.5, 32.5, 3, 3, "F"); }
      doc.text(c.toUpperCase(), x + 6, 35.5);
    });
    // Tabela de dados
    autoTable(doc, {
      startY: 42,
      head: [["DADOS", "", "DADOS", ""]],
      body: [
        ["Placa", veh?.plate ?? "—", "Nº OS", orderNumber ?? "—"],
        ["Modelo do carro", order.mod_carro || veh?.plate || "—", "Validade do óleo", order.validade_oleo || "—"],
        ["KM atual", order.km_atual?.toString() ?? "—", "Combustível chegada", order.combustivel_chegada || "—"],
        ["Data entrada", order.data_entrada || "—", "Hora entrada", order.hora_entrada || "—"],
        ["Data saída", order.data_saida || "—", "Hora saída", order.hora_saida || "—"],
        ["Motorista", drv?.full_name ?? "—", "Oficina", order.workshop || "—"],
      ],
      styles: { fontSize: 9 },
      headStyles: { fillColor: [30, 40, 80], textColor: 255 },
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 38 } },
    });
    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    const section = (title: string, content: string, h: number) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.setFillColor(30, 40, 80); doc.setTextColor(255);
      doc.rect(14, y, 182, 6, "F"); doc.text(title, 16, y + 4);
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      y += 6;
      doc.rect(14, y, 182, h);
      const lines = doc.splitTextToSize(content || "—", 178);
      doc.text(lines, 16, y + 5);
      y += h + 4;
    };
    section("DESCRIÇÃO DO PROBLEMA", order.failure_description, 36);
    section("DESCRIÇÃO DA SOLUÇÃO", order.solution_description ?? "", 36);
    section("ITENS TROCADOS", order.items_replaced ?? "", 20);
    if (order.observations) section("OBSERVAÇÕES", order.observations, 16);
    // Assinaturas
    y += 10;
    doc.setFontSize(9);
    doc.line(20, y, 90, y); doc.text("Assinatura do mecânico", 30, y + 5);
    doc.line(120, y, 190, y); doc.text("Assinatura do responsável", 130, y + 5);
    doc.text(`Data: ____ / ____ / ________`, 20, y + 15);
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
        <div><Label className="text-xs">Categoria</Label>
          <select value={order.maintenance_category ?? "corretiva"} onChange={(e) => setOrder({ ...order, maintenance_category: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
            <option value="corretiva">Corretiva</option><option value="preventiva">Preventiva</option><option value="planejada">Planejada</option>
          </select>
        </div>
        <div><Label className="text-xs">Tipo / serviço</Label><Input value={order.service_type} onChange={(e) => setOrder({ ...order, service_type: e.target.value })} /></div>
        <div><Label className="text-xs">Oficina responsável</Label><Input value={order.workshop} onChange={(e) => setOrder({ ...order, workshop: e.target.value })} /></div>
        <div><Label className="text-xs">Modelo do carro</Label><Input value={order.mod_carro ?? ""} onChange={(e) => setOrder({ ...order, mod_carro: e.target.value })} /></div>
        <div><Label className="text-xs">KM atual</Label><Input type="number" value={order.km_atual ?? ""} onChange={(e) => setOrder({ ...order, km_atual: e.target.value ? Number(e.target.value) : null })} /></div>
        <div><Label className="text-xs">Validade do óleo</Label><Input value={order.validade_oleo ?? ""} onChange={(e) => setOrder({ ...order, validade_oleo: e.target.value })} placeholder="KM ou data" /></div>
        <div><Label className="text-xs">Combustível chegada</Label><Input value={order.combustivel_chegada ?? ""} onChange={(e) => setOrder({ ...order, combustivel_chegada: e.target.value })} /></div>
        <div><Label className="text-xs">Data entrada</Label><Input type="date" value={order.data_entrada ?? ""} onChange={(e) => setOrder({ ...order, data_entrada: e.target.value })} /></div>
        <div><Label className="text-xs">Hora entrada</Label><Input type="time" value={order.hora_entrada ?? ""} onChange={(e) => setOrder({ ...order, hora_entrada: e.target.value })} /></div>
        <div><Label className="text-xs">Data saída</Label><Input type="date" value={order.data_saida ?? ""} onChange={(e) => setOrder({ ...order, data_saida: e.target.value })} /></div>
        <div><Label className="text-xs">Hora saída</Label><Input type="time" value={order.hora_saida ?? ""} onChange={(e) => setOrder({ ...order, hora_saida: e.target.value })} /></div>
        <div className="md:col-span-3"><Label className="text-xs">Descrição da solução</Label><Textarea rows={3} value={order.solution_description ?? ""} onChange={(e) => setOrder({ ...order, solution_description: e.target.value })} /></div>
        <div className="md:col-span-3"><Label className="text-xs">Itens trocados</Label><Textarea rows={2} value={order.items_replaced ?? ""} onChange={(e) => setOrder({ ...order, items_replaced: e.target.value })} /></div>
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