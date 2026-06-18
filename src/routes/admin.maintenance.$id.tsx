import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileDown, Save, Trash2, XIcon, Search, Paperclip, AlertTriangle } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding, BASE_CODES } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";
import { FINAL_STATUSES, STATUS_OPTIONS, statusLabel, statusTone, type MaintenanceStatus } from "@/lib/maintenance";

export const Route = createFileRoute("/admin/maintenance/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    checklist: typeof s.checklist === "string" ? s.checklist : null,
  }),
  component: OrderForm,
});

type Order = {
  id?: string; order_number?: string; order_type: "SMI" | "SMV"; base_code: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  failure_description: string; service_type: string; workshop: string;
  status: MaintenanceStatus; observations: string;
  maintenance_category?: string; validade_oleo?: string; km_atual?: number | null;
  combustivel_chegada?: string; data_entrada?: string; hora_entrada?: string;
  data_saida?: string; hora_saida?: string; mod_carro?: string;
  solution_description?: string; items_replaced?: string;
  labor_description?: string; labor_hours?: number | null; labor_cost?: number | null;
  parts_needed?: string; parts_supplier?: string; parts_cost?: number | null;
  final_observation?: string;
  approved_at?: string | null; approved_by?: string | null; denial_reason?: string | null;
};

// --- FUNÇÃO PURA: Carrega Anexos ---
async function fetchAllPhotos(orderId: string, checklistId: string | null) {
  let list: any[] = [];
  const { data: pData } = await supabase.from("maintenance_photos").select("id, category, storage_path").eq("order_id", orderId);
  if (pData && pData.length > 0) {
    const mapped = await Promise.all(pData.map(async (r) => {
      const { data } = await supabase.storage.from("maintenance-photos").createSignedUrl(r.storage_path, 3600);
      return { id: r.id, category: r.category, storage_path: r.storage_path, url: data?.signedUrl ?? "" };
    }));
    list = [...list, ...mapped];
  }
  if (checklistId) {
    const { data: cData } = await supabase.from("checklist_responses").select("id, photo_url, checklist_items(name)").eq("checklist_id", checklistId).not("photo_url", "is", null);
    if (cData && cData.length > 0) {
      const mapped = await Promise.all(cData.map(async (r: any) => {
        const { data } = await supabase.storage.from("checklist-photos").createSignedUrl(r.photo_url, 3600);
        return { id: r.id, category: `Falha: ${r.checklist_items?.name ?? "Item"}`, storage_path: r.photo_url, url: data?.signedUrl ?? "" };
      }));
      list = [...list, ...mapped];
    }
  }
  return list;
}

// --- MICRO-COMPONENTE: Janela de Upload ---
function BudgetUploadModal({ onClose, onConfirm, busy }: { onClose: () => void, onConfirm: (f: File) => void, busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-primary flex items-center gap-2"><Paperclip className="size-5" />Anexar Orçamento</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <p className="text-sm text-muted-foreground">O status mudou para "Aguardando Aprovação". Por favor, anexe a foto ou PDF do orçamento para o Master avaliar.</p>
        <input type="file" accept="image/*,.pdf" ref={ref} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Pular</Button>
          <Button className="flex-1" disabled={busy} onClick={() => {
            const f = ref.current?.files?.[0];
            if (!f) return toast.error("Selecione um arquivo primeiro.");
            onConfirm(f);
          }}>{busy ? "Enviando..." : "Enviar Orçamento"}</Button>
        </div>
      </Card>
    </div>
  );
}

// --- MICRO-COMPONENTE: Janela de Exclusão (Resolve o erro do botão morto) ---
function DeleteOSModal({ onClose, onConfirm, busy, isFinalized }: { onClose: () => void, onConfirm: (reason: string) => void, busy: boolean, isFinalized: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-[70] bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg text-destructive flex items-center gap-2"><Trash2 className="size-5" />Mover para a Lixeira</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        {isFinalized && (
          <div className="rounded-md border border-orange-300 bg-orange-500/10 p-3 text-xs text-orange-900 dark:text-orange-300 flex gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5 text-orange-500" />
            <span>Esta OS está <strong>finalizada</strong>. Ao excluir, o vínculo financeiro será removido automaticamente do módulo Financeiro.</span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Tem certeza que deseja mover esta OS para a lixeira? Informe o motivo abaixo (obrigatório).</p>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da exclusão..." />
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => {
            if (!reason.trim()) { toast.error("O motivo é obrigatório."); return; }
            onConfirm(reason);
          }}>{busy ? "Excluindo..." : "Confirmar"}</Button>
        </div>
      </Card>
    </div>
  );
}

// --- MICRO-COMPONENTE: Painel de Anexos Visível ---
function AttachmentsPanel({ photos, onUpload, busy }: { photos: Array<any>, onUpload: (f: File) => void, busy: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Card className="p-5 space-y-4 border-primary/20">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Paperclip className="size-5 text-primary" />
          <h2 className="font-bold text-lg">Evidências e Orçamentos Anexados</h2>
        </div>
        <div>
          <input type="file" className="hidden" ref={ref} accept="image/*,.pdf" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { onUpload(f); e.target.value = ''; }
          }} />
          <Button size="sm" variant="outline" onClick={() => ref.current?.click()} disabled={busy}>
            <Paperclip className="size-4 mr-1" /> {busy ? "Enviando..." : "Anexar Arquivo"}
          </Button>
        </div>
      </div>
      
      {photos.length === 0 ? (
        <div className="text-sm text-muted-foreground italic py-2">Nenhum arquivo ou evidência encontrada para esta OS. Adicione um orçamento pelo botão acima.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {photos.map(p => {
              const isPdf = p.storage_path?.endsWith(".pdf");
              const isBudget = p.category === "orcamento";
              const isChecklist = p.category.startsWith("Falha:");
              return (
                <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className={`relative aspect-square rounded overflow-hidden border ${isBudget ? "border-primary/40 bg-primary/5 hover:border-primary" : "border-border bg-muted/40"} flex items-center justify-center`}>
                  <div className={`absolute top-0 left-0 text-white text-[10px] px-2 py-1 z-10 font-bold max-w-full truncate ${isBudget ? "bg-primary uppercase" : isChecklist ? "bg-amber-600" : "bg-black/60 uppercase"}`}>
                    {isBudget ? "Orçamento" : p.category}
                  </div>
                  {isPdf 
                    ? <div className="text-center p-2"><Search className={`size-6 mx-auto mb-1 ${isBudget ? "text-primary" : "text-muted-foreground"}`} /><span className="text-xs font-bold text-primary underline">Abrir PDF</span></div>
                    : <img src={p.url} alt="Evidência" className="w-full h-full object-cover z-0" loading="lazy" />
                  }
                </a>
              );
            })}
          </div>
          <div className="text-xs text-muted-foreground pt-1">• Clique em um arquivo acima para visualizá-lo em tamanho completo.</div>
        </>
      )}
    </Card>
  );
}

function OrderForm() {
  const { id } = useParams({ from: "/admin/maintenance/$id" });
  const { checklist: fromChecklistId } = Route.useSearch();
  const nav = useNavigate();
  const { user, isAdmin, isMaster } = useAuth();
  const isNew = id === "new";
  
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [denyBusy, setDenyBusy] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [denyReasonTemp, setDenyReasonTemp] = useState("");
  const [photos, setPhotos] = useState<Array<{ id: string; category: string; storage_path: string; url: string }>>([]);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [uploadingBudget, setUploadingBudget] = useState(false);
  
  // Novos estados para a Lixeira
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [order, setOrder] = useState<Order>({
    order_type: "SMI", base_code: "VOT", vehicle_id: null, driver_id: null, checklist_id: fromChecklistId ?? null,
    failure_description: "", service_type: "", workshop: "", status: "pendente", observations: "",
    maintenance_category: "corretiva", validade_oleo: "", km_atual: null,
    combustivel_chegada: "", data_entrada: "", hora_entrada: "",
    data_saida: "", hora_saida: "", mod_carro: "", solution_description: "", items_replaced: "",
    denial_reason: null,
  });
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plate: string }>>([]);
  const [drivers, setDrivers] = useState<Array<{ id: string; full_name: string | null }>>([]);
  const [busy, setBusy] = useState(false);
  const [savedStatus, setSavedStatus] = useState<MaintenanceStatus>("pendente");
  const [evolutions, setEvolutions] = useState<Array<{ id: string; created_at: string; status: string | null; observation: string; user_id: string | null; user_name?: string | null }>>([]);
  const [itemsInput, setItemsInput] = useState("");
  const [itemsList, setItemsList] = useState<string[]>([]);
  const itemInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { (async () => {
    if (isNew) return;
    const { data } = await supabase.from("maintenance_evolutions").select("id, created_at, status, observation, user_id").eq("order_id", id).order("created_at", { ascending: false });
    const rows = (data ?? []) as Array<{ id: string; created_at: string; status: string | null; observation: string; user_id: string | null }>;
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: dd } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameById = Object.fromEntries((dd ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setEvolutions(rows.map((r) => ({ ...r, user_name: r.user_id ? nameById[r.user_id] ?? null : null })));
  })(); }, [id, isNew]);

  useEffect(() => { (async () => {
    const [{ data: vs }, { data: ds }] = await Promise.all([
      supabase.from("vehicles").select("id, plate").order("plate"),
      supabase.from("profiles").select("id, full_name").eq("driver_active", true).order("full_name"),
    ]);
    setVehicles((vs ?? []) as Array<{ id: string; plate: string }>);
    setDrivers((ds ?? []) as Array<{ id: string; full_name: string | null }>);
    
    if (!isNew) {
      const { data, error } = await supabase.from("maintenance_orders").select("*").eq("id", id).maybeSingle();
      if (error) { toast.error("Erro ao carregar ordem: " + error.message); return; }
      if (data) { 
        setOrder({ ...(data as unknown as Order), denial_reason: (data as any).denial_reason ?? null }); 
        setOrderNumber(data.order_number); 
        setSavedStatus((data as any).status as MaintenanceStatus ?? "pendente");
        setItemsList((data.items_replaced as string ?? "").split(",").map((s: string) => s.trim()).filter(Boolean));

        const loadedPhotos = await fetchAllPhotos(id, data.checklist_id);
        setPhotos(loadedPhotos);
      }
    }
  })(); }, [id, isNew]);

  const uploadBudget = async (file: File) => {
    if (isNew) { toast.error("Salve a OS primeiro antes de anexar arquivos."); setShowBudgetModal(false); return; }
    setUploadingBudget(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${id}/orcamento/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("maintenance-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await (supabase as any).from("maintenance_photos").insert({ order_id: id, category: "orcamento", storage_path: path, uploaded_by: user?.id ?? null });
      if (insErr) throw insErr;
      toast.success("Orçamento anexado com sucesso!");
      
      const { data: signed } = await supabase.storage.from("maintenance-photos").createSignedUrl(path, 3600);
      setPhotos(prev => [...prev, { id: Date.now().toString(), category: "orcamento", storage_path: path, url: signed?.signedUrl ?? "" }]);
    } catch (e) { toast.error((e as Error).message); }
    finally { setUploadingBudget(false); setShowBudgetModal(false); }
  };

  const approveOrder = async () => {
    if (!user || !isMaster || isNew || order.status !== "aguardando_aprovacao") return;
    if (!confirm("Aprovar esta SMV/SMI e liberar a ordem para atualização?")) return;
    setApprovalBusy(true);
    try {
      const approvedAt = new Date().toISOString();
      const { error } = await supabase.from("maintenance_orders").update({ status: "aprovada", approved_at: approvedAt, approved_by: user.id, denial_reason: null } as never).eq("id", id);
      if (error) throw new Error(error.message);
      await supabase.from("maintenance_evolutions").insert({ order_id: id, user_id: user.id, status: "aprovada", observation: "SMV/SMI aprovada pelo Master." });
      setOrder({ ...order, status: "aprovada", approved_at: approvedAt, approved_by: user.id, denial_reason: null });
      setSavedStatus("aprovada");
      toast.success("Ordem aprovada com sucesso");
    } catch (e) { toast.error((e as Error).message); } 
    finally { setApprovalBusy(false); }
  };

  const confirmDeny = async () => {
    if (!user || !isMaster || isNew || order.status !== "aguardando_aprovacao") return;
    const reason = denyReasonTemp.trim();
    if (!reason) { toast.error("Insira o motivo da negação."); return; }
    setDenyBusy(true);
    try {
      const { error } = await supabase.from("maintenance_orders").update({ status: "negada", denial_reason: reason } as never).eq("id", id);
      if (error) throw new Error(error.message);
      await supabase.from("maintenance_evolutions").insert({ order_id: id, user_id: user.id, status: "negada", observation: `SMV/SMI negada pelo Master. Motivo: ${reason}` });
      setOrder({ ...order, status: "negada", denial_reason: reason });
      setSavedStatus("negada");
      setShowDenyModal(false);
      toast.success("OS negada com sucesso");
    } catch (e) { toast.error((e as Error).message); } 
    finally { setDenyBusy(false); }
  };

  const confirmDelete = async (reason: string) => {
    setDeleteBusy(true);
    try {
      // OS finalizada: remover vínculos financeiros antes de excluir
      if (savedStatus === "finalizada") {
        const { error: e1 } = await (supabase as any)
          .from("maintenance_financial_links")
          .delete()
          .eq("maintenance_order_id", id);
        if (e1) throw new Error(e1.message);

        const { error: e2 } = await (supabase as any)
          .from("maintenance_os_link_finalized")
          .delete()
          .eq("maintenance_order_id", id);
        if (e2) throw new Error(e2.message);
      }

      const { error } = await supabase.from("maintenance_orders").update({
        deleted_at: new Date().toISOString(),
        deleted_by: user?.id ?? null,
        delete_reason: reason.trim()
      } as never).eq("id", id);

      if (error) throw new Error(error.message);

      toast.success("OS movida para a Lixeira");
      nav({ to: "/admin/maintenance" });
    } catch (e) {
      toast.error((e as Error).message);
      setDeleteBusy(false);
    }
  };

  const isApprovalLocked = savedStatus === "aguardando_aprovacao";

  const updateItems = (newList: string[]) => {
    setItemsList(newList);
    setOrder((prev) => ({ ...prev, items_replaced: newList.join(", ") }));
  };

  const handleItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const value = itemsInput.trim().toUpperCase();
    if (value) updateItems([...itemsList, value]);
    setItemsInput("");
  };

  const removeItem = (index: number) => {
    updateItems(itemsList.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (itemsList.length === 0) {
      toast.error("Itens trocados é obrigatório. Adicione ao menos um item.");
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const { data: num, error: ne } = await supabase.rpc("next_order_number", { _base: order.base_code });
        if (ne) throw new Error(ne.message);
        const payload = { ...order, order_number: num as string, created_by: user?.id ?? null };
        const { data, error } = await supabase.from("maintenance_orders").insert(payload as never).select("id, order_number").single();
        if (error) throw new Error(error.message);
        toast.success(`Ordem ${data?.order_number} criada`);
        if (data?.id) nav({ to: "/admin/maintenance/$id", params: { id: data.id } });
      } else {
        const { error } = await supabase.from("maintenance_orders").update(order as never).eq("id", id);
        if (error) throw new Error(error.message);
        setSavedStatus(order.status);
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
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("TIPO DE MANUTENÇÃO:", 14, 36); doc.setFont("helvetica", "normal");
    const cats = ["corretiva", "preventiva", "planejada"] as const;
    cats.forEach((c, i) => { const x = 60 + i * 45; doc.rect(x, 32, 4, 4); if (order.maintenance_category === c) { doc.setFillColor(0, 0, 0); doc.rect(x + 0.5, 32.5, 3, 3, "F"); } doc.text(c.toUpperCase(), x + 6, 35.5); });
    autoTable(doc, {
      startY: 42, head: [["DADOS", "", "DADOS", ""]],
      body: [
        ["Placa", veh?.plate ?? "—", "Nº OS", orderNumber ?? "—"],
        ["Modelo do carro", order.mod_carro || veh?.plate || "—", "Validade do óleo", order.validade_oleo || "—"],
        ["KM atual", order.km_atual?.toString() ?? "—", "Combustível chegada", order.combustivel_chegada || "—"],
        ["Data entrada", order.data_entrada || "—", "Hora entrada", order.hora_entrada || "—"],
        ["Data saída", order.data_saida || "—", "Hora saída", order.hora_saida || "—"],
        ["Motorista", drv?.full_name || "—", "Oficina", order.workshop || "—"],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 40, 80], textColor: 255 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 38 }, 2: { fontStyle: "bold", cellWidth: 38 } },
    });
    let y = (doc as any).lastAutoTable.finalY + 6;
    const section = (title: string, content: string, h: number) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setFillColor(30, 40, 80); doc.setTextColor(255);
      doc.rect(14, y, 182, 6, "F"); doc.text(title, 16, y + 4);
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      y += 6; doc.rect(14, y, 182, h);
      const lines = doc.splitTextToSize(content || "—", 178); doc.text(lines, 16, y + 5);
      y += h + 4;
    };
    section("DESCRIÇÃO DO PROBLEMA", order.failure_description, 36); section("DESCRIÇÃO DA SOLUÇÃO", order.solution_description ?? "", 36); section("ITENS TROCADOS", order.items_replaced ?? "", 20);
    if (order.observations) section("OBSERVAÇÕES", order.observations, 16);
    y += 10; doc.setFontSize(9); doc.line(20, y, 90, y); doc.text("Assinatura do mecânico", 30, y + 5); doc.line(120, y, 190, y); doc.text("Assinatura do responsável", 130, y + 5); doc.text(`Data: ____ / ____ / ________`, 20, y + 15);
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
          {!isNew && isMaster && order.status === "aguardando_aprovacao" && (
            <div className="flex flex-wrap gap-2 items-end">
              <Button variant="secondary" onClick={approveOrder} disabled={approvalBusy || denyBusy}><CheckCircle2 className="size-4" />{approvalBusy ? "Aprovando..." : "Aprovar SMV/SMI"}</Button>
              <Button variant="destructive" onClick={() => { setDenyReasonTemp(order.denial_reason ?? ""); setShowDenyModal(true); }} disabled={approvalBusy || denyBusy}>{denyBusy ? "Negando..." : "Negar SMV/SMI"}</Button>
            </div>
          )}
          {/* BOTÃO EXCLUIR AGORA ABRE A NOSSA JANELINHA */}
          {!isNew && isAdmin && (
            <Button variant="destructive" onClick={() => setShowDeleteModal(true)}>
              <Trash2 className="size-4 mr-1" />Excluir
            </Button>
          )}
          <Button onClick={save} disabled={busy || approvalBusy || isApprovalLocked}><Save className="size-4" />{busy ? "..." : "Salvar"}</Button>
        </div>
      </div>
      
      {!isNew && order.status === "aguardando_aprovacao" && (
        <div className="rounded-md border border-yellow-200 bg-yellow-500/10 p-4 text-sm text-yellow-900">
          Esta ordem aguarda aprovação de um usuário <strong>Master</strong>. O formulário está bloqueado até a aprovação; apenas o Master pode aprovar ou negar.
        </div>
      )}

      {!isNew && <AttachmentsPanel photos={photos} onUpload={uploadBudget} busy={uploadingBudget} />}

      <fieldset disabled={isApprovalLocked} className={isApprovalLocked ? "space-y-4 opacity-70" : "space-y-4"}>
        <Card className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label className="text-xs">Tipo *</Label>
            <select value={order.order_type} onChange={(e) => setOrder({ ...order, order_type: e.target.value as "SMI" | "SMV" })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"><option value="SMI">SMI — Interna</option><option value="SMV">SMV — Externa</option></select>
          </div>
          <div><Label className="text-xs">Base *</Label>
            <select value={order.base_code} onChange={(e) => setOrder({ ...order, base_code: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm" disabled={!isNew}>{BASE_CODES.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.label}</option>)}</select>
          </div>
          <div><Label className="text-xs">Status</Label>
            <select value={order.status} onChange={(e) => {
                const val = e.target.value as MaintenanceStatus;
                setOrder({ ...order, status: val });
                if (val === "aguardando_aprovacao") setShowBudgetModal(true);
              }} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              {STATUS_OPTIONS.filter((o) => isMaster || !FINAL_STATUSES.includes(o.value as any) || o.value === order.status).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Veículo</Label>
            <select value={order.vehicle_id ?? ""} onChange={(e) => setOrder({ ...order, vehicle_id: e.target.value || null })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select>
          </div>
          <div className="md:col-span-2"><Label className="text-xs">Motorista</Label>
            <select value={order.driver_id ?? ""} onChange={(e) => setOrder({ ...order, driver_id: e.target.value || null })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name ?? d.id.slice(0,8)}</option>)}</select>
          </div>
          <div className="md:col-span-3"><Label className="text-xs">Descrição da falha</Label><Textarea rows={3} value={order.failure_description} onChange={(e) => setOrder({ ...order, failure_description: e.target.value })} /></div>
          <div><Label className="text-xs">Categoria</Label>
            <select value={order.maintenance_category ?? "corretiva"} onChange={(e) => setOrder({ ...order, maintenance_category: e.target.value })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"><option value="corretiva">Corretiva</option><option value="preventiva">Preventiva</option><option value="planejada">Planejada</option></select>
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
          <div className="md:col-span-3">
            <Label className="text-xs">Itens trocados *</Label>
            <div
              className="min-h-[72px] border border-border rounded-md bg-input p-2 flex flex-wrap gap-1.5 cursor-text"
              onClick={() => itemInputRef.current?.focus()}
            >
              {itemsList.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-primary/15 text-primary text-xs font-semibold px-2 py-1 rounded">
                  {item}
                  <button type="button" onClick={() => removeItem(i)} className="hover:text-destructive transition-colors"><XIcon className="size-3" /></button>
                </span>
              ))}
              <input
                ref={itemInputRef}
                value={itemsInput}
                onChange={(e) => setItemsInput(e.target.value)}
                onKeyDown={handleItemKeyDown}
                className="flex-1 min-w-[180px] outline-none bg-transparent text-sm py-0.5"
                placeholder={itemsList.length === 0 ? "Digite um item e pressione Enter…" : ""}
              />
            </div>
          </div>
          <div className="md:col-span-3"><Label className="text-xs">Observações</Label><Textarea rows={3} value={order.observations} onChange={(e) => setOrder({ ...order, observations: e.target.value })} /></div>
        </Card>
      </fieldset>

      {!isNew && order.status === "negada" && (
        <Card className="p-5 border-rose-200 bg-rose-50">
          <div className="font-semibold mb-2">Motivo da OS negada</div>
          <p className="text-sm whitespace-pre-line">{order.denial_reason ?? "—"}</p>
        </Card>
      )}

      {!isNew && (
        <Card className="p-5">
          <div className="font-semibold mb-3">Evolução da manutenção</div>
          {evolutions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nenhuma atualização registrada ainda. O mecânico pode adicionar entradas pelo painel próprio.</div>
          ) : (
            <div className="space-y-2">
              {evolutions.map((e) => (
                <div key={e.id} className="text-sm p-3 bg-muted/40 rounded">
                  <div className="flex justify-between gap-2 text-xs text-muted-foreground">
                    <span>{new Date(e.created_at).toLocaleString("pt-BR")}</span>
                    <span className={`px-2 py-0.5 rounded ${statusTone(e.status ?? "")}`}>{statusLabel(e.status ?? "—")}</span>
                  </div>
                  <div className="font-medium mt-1">{e.user_name ?? "—"}</div>
                  <div className="text-sm whitespace-pre-line">{e.observation}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {showDenyModal && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={() => setShowDenyModal(false)}>
          <Card className="w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg text-destructive">Negar Ordem de Serviço</h3>
            <p className="text-sm text-muted-foreground">Por favor, justifique o motivo da negação desta SMV/SMI.</p>
            <Textarea rows={4} value={denyReasonTemp} onChange={(e) => setDenyReasonTemp(e.target.value)} placeholder="Ex: Orçamento muito alto, peça já disponível em estoque..." />
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setShowDenyModal(false)}>Cancelar</Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDeny} disabled={denyBusy}>{denyBusy ? "Salvando..." : "Confirmar Negação"}</Button>
            </div>
          </Card>
        </div>
      )}

      {showBudgetModal && (
        <BudgetUploadModal 
          busy={uploadingBudget}
          onClose={() => setShowBudgetModal(false)}
          onConfirm={uploadBudget}
        />
      )}

      {showDeleteModal && (
        <DeleteOSModal
          busy={deleteBusy}
          isFinalized={savedStatus === "finalizada"}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}