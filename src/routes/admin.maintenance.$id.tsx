import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { softDeleteMaintenanceOrder } from "@/lib/maintenance.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, Ban, CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, Clock, FileDown,
  FileText, History, MoreVertical, Package, Paperclip, Play, Plus, RotateCcw, Save, Trash2, Truck, Wrench, X as XIcon,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding, BASE_CODES } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { isOsGestor, prettyName } from "@/lib/nav";
import {
  IS_DONE_STATUS, IS_STOPPED_STATUS, IS_WAITING_PART, OPEN_STATUSES, statusLabelFor, timeAgo, type MaintenanceStatus, type OsKind,
} from "@/lib/maintenance";
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { StageStepper, StatusBadge, TypeBadge } from "@/components/maintenance-ui";

type Search = { checklist?: string; vehicle?: string; reason?: string; tipo?: string };

export const Route = createFileRoute("/admin/maintenance/$id")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    checklist: typeof s.checklist === "string" ? s.checklist : undefined,
    vehicle: typeof s.vehicle === "string" ? s.vehicle : undefined,
    reason: typeof s.reason === "string" ? s.reason : undefined,
    tipo: typeof s.tipo === "string" ? s.tipo : undefined,
  }),
  component: OrderForm,
});

type Order = {
  id?: string; order_number?: string; created_at?: string; deleted_at?: string | null;
  order_type: OsKind; base_code: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  failure_description: string | null; service_type: string | null; workshop: string | null;
  status: MaintenanceStatus; observations: string | null;
  maintenance_category?: string | null; validade_oleo?: string | null; km_atual?: number | null;
  combustivel_chegada?: string | null; data_entrada?: string | null; hora_entrada?: string | null;
  data_saida?: string | null; hora_saida?: string | null; mod_carro?: string | null;
  solution_description?: string | null; items_replaced?: string | null; final_observation?: string | null;
  parts_needed?: string | null; previsao_saida?: string | null;
  part_requested_at?: string | null; part_requested_by?: string | null;
  part_purchase_due?: string | null; part_arrival_due?: string | null;
  part_decided_at?: string | null; part_decided_by?: string | null; part_arrived_at?: string | null;
  cancel_reason?: string | null; valor_total?: number | null;
};

type Photo = { id: string; category: string; storage_path: string; url: string; source: "os" | "checklist" };
type VehicleOpt = { id: string; plate: string; model: string | null; base: string | null; mileage: number | null; active: boolean | null };
type Person = { id: string; full_name: string | null };
type Evolution = { id: string; created_at: string; status: string | null; observation: string; user_id: string | null; user_name?: string | null };
type UploadCategory = "falha" | "execucao" | "conclusao" | "orcamento" | "os_externa";

const UPLOADS: Record<OsKind, Array<{ key: UploadCategory; label: string }>> = {
  SMI: [
    { key: "falha", label: "Foto da falha" },
    { key: "execucao", label: "Execução" },
    { key: "conclusao", label: "Conclusão" },
    { key: "orcamento", label: "Nota da peça" },
  ],
  SMV: [
    { key: "os_externa", label: "OS da oficina" },
    { key: "orcamento", label: "Orçamento / nota" },
    { key: "falha", label: "Foto" },
  ],
};
const CATEGORY_LABEL: Record<string, string> = {
  orcamento: "Nota/orçamento", falha: "Falha", execucao: "Execução", conclusao: "Conclusão", os_externa: "OS da oficina",
};
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const FUEL_LEVELS = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];
const SERVICE_SUGGESTIONS = ["Mecânica", "Elétrica", "Funilaria e pintura", "Pneus", "Freios", "Suspensão", "Hidráulica", "Troca de óleo", "Revisão preventiva", "Ar-condicionado"];
const INTERNAL_WORKSHOP = "Grupo Tomaz";

const emptyOrder = (kind: OsKind, checklistId?: string): Order => ({
  order_type: kind, base_code: "VOT", vehicle_id: null, driver_id: null, checklist_id: checklistId ?? null,
  failure_description: "", service_type: "", workshop: kind === "SMI" ? INTERNAL_WORKSHOP : "", status: "aberta", observations: "",
  maintenance_category: "corretiva", validade_oleo: "", km_atual: null, combustivel_chegada: "",
  data_entrada: "", hora_entrada: "", data_saida: "", hora_saida: "", mod_carro: "",
  solution_description: "", items_replaced: "", previsao_saida: "", valor_total: null,
});

const splitItems = (s?: string | null) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
// Colunas date/time/numeric rejeitam string vazia; o banco recebe null no lugar
const toDbPayload = (o: Order) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));
const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

// A base do veículo vem por extenso ("VOTORANTIM (MATRIZ)"); o nº da OS usa o código curto (VOT)
function baseCodeFromVehicleBase(base: string | null | undefined): string | null {
  if (!base) return null;
  const n = normalize(base);
  if (n.startsWith("OBRA")) return "OBRA";
  return BASE_CODES.find((b) => n === b.code || n.includes(normalize(b.label)))?.code ?? null;
}

function uniqueSorted(values: Array<string | null | undefined>) {
  const byKey = new Map<string, string>();
  for (const v of values) { const t = v?.trim(); if (t && !byKey.has(normalize(t))) byKey.set(normalize(t), t); }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const isFilled = (v: unknown) => v !== null && v !== undefined && v !== "";
const countFilled = (...vals: unknown[]) => vals.filter(isFilled).length;
const pad = (n: number) => String(n).padStart(2, "0");
function nowParts() {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
const fmtDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("pt-BR") : "—");
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numOrNull = (v: string) => (v === "" ? null : Number(v));
// Pedido de peça ainda sem resposta (um novo pedido depois de uma resposta antiga também conta)
const partPending = (o: Order) => IS_WAITING_PART(o.status) && !o.part_decided_at;

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEscape]);
}

async function fetchAllPhotos(orderId: string, checklistId: string | null): Promise<Photo[]> {
  const list: Photo[] = [];
  const { data: pData } = await supabase.from("maintenance_photos").select("id, category, storage_path").eq("order_id", orderId).order("created_at", { ascending: true });
  if (pData?.length) {
    const { data: signed } = await supabase.storage.from("maintenance-photos").createSignedUrls(pData.map((r) => r.storage_path).filter((p): p is string => !!p), 3600);
    const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? ""]));
    for (const r of pData) {
      if (!r.storage_path) continue;
      list.push({ id: r.id, category: r.category ?? "", storage_path: r.storage_path, url: urlMap.get(r.storage_path) ?? "", source: "os" });
    }
  }
  if (checklistId) {
    const { data: cData } = await (supabase as any).from("checklist_responses").select("id, photo_url, checklist_items(name)").eq("checklist_id", checklistId).not("photo_url", "is", null);
    const rows = (cData ?? []) as Array<{ id: string; photo_url: string; checklist_items: { name: string } | null }>;
    if (rows.length) {
      const { data: signed } = await supabase.storage.from("checklist-photos").createSignedUrls(rows.map((r) => r.photo_url), 3600);
      const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? ""]));
      for (const r of rows) list.push({ id: r.id, category: r.checklist_items?.name ?? "Item", storage_path: r.photo_url, url: urlMap.get(r.photo_url) ?? "", source: "checklist" });
    }
  }
  return list;
}

// ---------------- Blocos de interface ----------------

function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label className="text-xs font-medium">{label}{required && <span className="text-destructive"> *</span>}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChoiceGroup<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<[T, string]>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-flow-col auto-cols-fr gap-1 rounded-md border border-border bg-muted/50 p-1">
      {options.map(([v, l]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn("h-8 truncate rounded px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed", value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Section({ icon: Icon, title, hint, open, onToggle, locked, filled, children }: {
  icon: ComponentType<{ className?: string }>; title: string; hint?: string; open?: boolean; onToggle?: () => void;
  locked?: boolean; filled?: [number, number]; children: ReactNode;
}) {
  const isOpen = onToggle ? !!open : true;
  const heading = (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {filled && (
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", filled[0] === filled[1] ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground")}>
          {filled[0]}/{filled[1]}
        </span>
      )}
    </>
  );
  return (
    <Card className="overflow-hidden">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40">
          {heading}
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>
      ) : (
        <div className="flex items-center gap-3 p-4 pb-1">{heading}</div>
      )}
      {isOpen && <fieldset disabled={locked} className="min-w-0 space-y-3 p-4 pt-3 disabled:opacity-70">{children}</fieldset>}
    </Card>
  );
}

function DateTimeField({ label, date, time, onChange }: { label: string; date?: string | null; time?: string | null; onChange: (date: string, time: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input type="date" value={date ?? ""} onChange={(e) => onChange(e.target.value, time ?? "")} className="min-w-0 flex-1" />
        <Input type="time" value={time ? time.slice(0, 5) : ""} onChange={(e) => onChange(date ?? "", e.target.value)} className="w-[6.5rem] shrink-0" />
        <Button type="button" variant="outline" className="shrink-0 px-3" onClick={() => { const n = nowParts(); onChange(n.date, n.time); }}>Agora</Button>
      </div>
    </Field>
  );
}

function ItemsInput({ items, input, onInput, onAdd, onRemove, inputRef }: {
  items: string[]; input: string; onInput: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void; inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-input p-2 focus-within:ring-2 focus-within:ring-ring/40" onClick={() => inputRef.current?.focus()}>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={`${it}-${i}`} className="inline-flex items-center gap-1 rounded bg-primary/15 py-1 pl-2 pr-1 text-xs font-semibold text-primary">
              {it}
              <button type="button" aria-label={`Remover ${it}`} onClick={(e) => { e.stopPropagation(); onRemove(i); }} className="rounded p-0.5 hover:bg-primary/20 hover:text-destructive"><XIcon className="size-3" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input ref={inputRef} value={input} onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); onAdd(); } }}
          enterKeyHint="done" placeholder={items.length ? "Adicionar outro…" : "Ex.: PASTILHA DE FREIO, ALINHAMENTO"} className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
        <Button type="button" size="sm" variant="secondary" disabled={!input.trim()} onClick={(e) => { e.stopPropagation(); onAdd(); }}><Plus />Adicionar</Button>
      </div>
    </div>
  );
}

function ModalShell({ onClose, children, z = "z-50" }: { onClose: () => void; children: ReactNode; z?: string }) {
  useEscape(onClose);
  return (
    <div className={cn("fixed inset-0 grid place-items-center bg-black/60 p-4", z)} onClick={onClose}>
      <Card role="dialog" aria-modal="true" className="w-full max-w-sm space-y-4 p-5" onClick={(e) => e.stopPropagation()}>{children}</Card>
    </div>
  );
}

function ModalHeader({ icon: Icon, title, tone, onClose }: { icon: ComponentType<{ className?: string }>; title: string; tone?: "danger"; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className={cn("flex items-center gap-2 text-lg font-bold", tone === "danger" ? "text-destructive" : "text-primary")}><Icon className="size-5" />{title}</h3>
      <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><XIcon /></Button>
    </div>
  );
}

function PartRequestModal({ busy, initial, onClose, onConfirm }: { busy: boolean; initial: string; onClose: () => void; onConfirm: (text: string) => void }) {
  const [text, setText] = useState(initial);
  return (
    <ModalShell onClose={onClose}>
      <ModalHeader icon={Package} title="Solicitar peça" onClose={onClose} />
      <p className="text-sm text-muted-foreground">O Frotas ADM recebe o pedido e informa a previsão de compra e de chegada — ou decide não seguir com a OS.</p>
      <Field label="Qual peça? Quantidade e especificação" required>
        <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: 2 pastilhas de freio dianteiras — Volvo FH 540" autoFocus />
      </Field>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button className="flex-1" disabled={busy} onClick={() => (text.trim() ? onConfirm(text.trim()) : toast.error("Descreva a peça necessária."))}>
          {busy ? "Enviando…" : "Enviar pedido"}
        </Button>
      </div>
    </ModalShell>
  );
}

function ReasonModal({ title, text, confirmLabel, busy, onClose, onConfirm }: {
  title: string; text: string; confirmLabel: string; busy: boolean; onClose: () => void; onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell onClose={onClose} z="z-[70]">
      <ModalHeader icon={Ban} title={title} tone="danger" onClose={onClose} />
      <p className="text-sm text-muted-foreground">{text}</p>
      <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (obrigatório)…" autoFocus />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Voltar</Button>
        <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => (reason.trim() ? onConfirm(reason.trim()) : toast.error("Informe o motivo."))}>
          {busy ? "Salvando…" : confirmLabel}
        </Button>
      </div>
    </ModalShell>
  );
}

function DeleteOSModal({ onClose, onConfirm, busy }: { onClose: () => void; onConfirm: (reason: string) => void; busy: boolean }) {
  return (
    <ReasonModal
      title="Mover para a lixeira"
      text="A OS sai do painel e pode ser restaurada pela Lixeira. Se estiver concluída, o vínculo no Financeiro é removido."
      confirmLabel="Mover para a lixeira"
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4"><Skeleton className="h-64 rounded-xl" /><Skeleton className="h-40 rounded-xl" /></div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

// ---------------- Ficha da OS ----------------

function OrderForm() {
  const { id } = useParams({ from: "/admin/maintenance/$id" });
  const { checklist: fromChecklistId, vehicle: fromVehicleId, reason: fromReason, tipo } = Route.useSearch();
  const nav = useNavigate();
  const { user, isAdmin, modules } = useAuth();
  const gestor = isOsGestor(modules, isAdmin);
  const isNew = id === "new";
  const newKind: OsKind = tipo === "externa" && gestor ? "SMV" : "SMI";

  const [order, setOrder] = useState<Order>(() => emptyOrder(newKind, fromChecklistId));
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [saved, setSaved] = useState<Order | null>(null);
  const [snapshot, setSnapshot] = useState("");
  const [loaded, setLoaded] = useState(isNew);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [extraDriver, setExtraDriver] = useState<Person | null>(null);
  const [suggestions, setSuggestions] = useState<{ services: string[]; workshops: string[] }>({ services: SERVICE_SUGGESTIONS, workshops: [] });
  const [existingOs, setExistingOs] = useState<{ id: string; order_number: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ prazos: true, solucao: false });
  const [itemsInput, setItemsInput] = useState("");
  const itemInputRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<UploadCategory | null>(null);
  const [modal, setModal] = useState<null | "peca" | "cancelar" | "lixeira">(null);
  const [newOsFile, setNewOsFile] = useState<File | null>(null);
  const [decision, setDecision] = useState({ purchase: "", arrival: "" });

  const kind: OsKind = order.order_type;
  const internal = kind === "SMI";
  const status = saved?.status ?? order.status;
  const set = <K extends keyof Order>(key: K, value: Order[K]) => setOrder((prev) => ({ ...prev, [key]: value }));
  const toggleSection = (k: string) => setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  const loadEvolutions = async () => {
    if (isNew) return;
    const { data } = await supabase.from("maintenance_evolutions").select("id, created_at, status, observation, user_id").eq("order_id", id).order("created_at", { ascending: false });
    const rows = (data ?? []) as Evolution[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: dd } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameById = Object.fromEntries((dd ?? []).map((p) => [p.id, prettyName(p.full_name) ?? "—"]));
    }
    setEvolutions(rows.map((r) => ({ ...r, user_name: r.user_id ? nameById[r.user_id] ?? null : null })));
  };

  useEffect(() => { (async () => {
    const [{ data: vs }, { data: ds }, { data: used }] = await Promise.all([
      supabase.from("vehicles").select("id, plate, model, base, mileage, active").order("plate"),
      supabase.from("profiles").select("id, full_name").eq("driver_active", true).order("full_name"),
      supabase.from("maintenance_orders").select("service_type, workshop, order_type").is("deleted_at", null).limit(1000),
    ]);
    setVehicles((vs ?? []) as VehicleOpt[]);
    setDrivers((ds ?? []) as Person[]);
    const usedRows = (used ?? []) as Array<{ service_type: string | null; workshop: string | null; order_type: string }>;
    setSuggestions({
      services: uniqueSorted([...SERVICE_SUGGESTIONS, ...usedRows.map((u) => u.service_type)]),
      workshops: uniqueSorted(usedRows.filter((u) => u.order_type === "SMV").map((u) => u.workshop)),
    });
  })(); }, []);

  // Nova OS a partir de checklist com falha ou de alerta do veículo
  useEffect(() => {
    if (!isNew) return;
    setOrder(emptyOrder(newKind, fromChecklistId));
    (async () => {
      if (fromChecklistId) {
        const [{ data: cl }, { data: dup }] = await Promise.all([
          supabase.from("checklists").select("vehicle_id, driver_id, odometer_start").eq("id", fromChecklistId).maybeSingle(),
          supabase.from("maintenance_orders").select("id, order_number").eq("checklist_id", fromChecklistId).is("deleted_at", null).limit(1).maybeSingle(),
        ]);
        if (dup) setExistingOs(dup as { id: string; order_number: string });
        if (!cl) return;
        const [{ data: vehData }, { data: resps }] = await Promise.all([
          cl.vehicle_id ? supabase.from("vehicles").select("model, base, mileage").eq("id", cl.vehicle_id).maybeSingle() : Promise.resolve({ data: null }),
          (supabase as any).from("checklist_responses").select("observation, checklist_items(name)").eq("checklist_id", fromChecklistId).eq("status", "NAO_OK"),
        ]);
        const veh = vehData as { model: string | null; base: string | null; mileage: number | null } | null;
        const failureText = ((resps ?? []) as Array<{ observation: string | null; checklist_items: { name: string } | null }>)
          .map((r) => `• ${r.checklist_items?.name ?? "Item"}${r.observation ? `: ${r.observation}` : ""}`).join("\n");
        setOrder((prev) => ({
          ...prev, checklist_id: fromChecklistId, vehicle_id: cl.vehicle_id ?? prev.vehicle_id, driver_id: cl.driver_id ?? prev.driver_id,
          km_atual: cl.odometer_start ?? veh?.mileage ?? prev.km_atual, mod_carro: veh?.model ?? prev.mod_carro,
          base_code: baseCodeFromVehicleBase(veh?.base) ?? prev.base_code, failure_description: failureText || prev.failure_description,
        }));
      } else if (fromVehicleId) {
        const { data: veh } = await supabase.from("vehicles").select("model, base, mileage").eq("id", fromVehicleId).maybeSingle();
        setOrder((prev) => ({
          ...prev, vehicle_id: fromVehicleId, km_atual: veh?.mileage ?? prev.km_atual, mod_carro: veh?.model ?? prev.mod_carro,
          base_code: baseCodeFromVehicleBase(veh?.base) ?? prev.base_code, failure_description: fromReason ?? prev.failure_description,
          maintenance_category: fromReason ? "preventiva" : prev.maintenance_category,
        }));
      }
    })();
  }, [isNew, newKind, fromChecklistId, fromVehicleId, fromReason]);

  useEffect(() => {
    if (isNew) { setLoaded(true); setSaved(null); return; }
    let alive = true;
    setLoaded(false);
    setExistingOs(null);
    (async () => {
      const { data, error } = await supabase.from("maintenance_orders").select("*").eq("id", id).maybeSingle();
      if (!alive) return;
      if (error || !data) { toast.error(error ? "Erro ao carregar a OS: " + error.message : "OS não encontrada ou sem permissão."); return; }
      const o = data as unknown as Order;
      setOrder(o); setSaved(o); setOrderNumber(o.order_number ?? null); setSnapshot(JSON.stringify(o));
      setDecision({ purchase: o.part_purchase_due ?? "", arrival: o.part_arrival_due ?? "" });
      setOpenSections({ prazos: true, solucao: o.order_type === "SMV" || !OPEN_STATUSES.includes(o.status) || o.status !== "aberta" || countFilled(o.solution_description, o.items_replaced) > 0 });
      setLoaded(true);
      if (o.driver_id) {
        const { data: p } = await supabase.from("profiles").select("id, full_name").eq("id", o.driver_id).maybeSingle();
        if (alive && p) setExtraDriver(p as Person);
      }
      const ph = await fetchAllPhotos(id, o.checklist_id);
      if (alive) setPhotos(ph);
    })();
    loadEvolutions();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew]);

  const inTrash = !!order.deleted_at;
  const closed = IS_DONE_STATUS(status) || IS_STOPPED_STATUS(status);
  // OS externa é do Frotas ADM; OS encerrada ou na lixeira fica somente leitura
  const locked = inTrash || (!isNew && closed) || (!internal && !gestor);
  const itemsList = splitItems(order.items_replaced);
  const dirty = !isNew && loaded && (JSON.stringify(order) !== snapshot || itemsInput.trim() !== "");
  const saveDisabled = !loaded || busy || locked;

  const updateItems = (list: string[]) => set("items_replaced", list.join(", "));
  const addItem = () => {
    const v = itemsInput.trim().toUpperCase();
    if (v) updateItems([...itemsList, v]);
    setItemsInput("");
    itemInputRef.current?.focus();
  };
  const discardChanges = () => { if (snapshot) { setOrder(JSON.parse(snapshot) as Order); setItemsInput(""); } };

  const onVehicleChange = (vid: string | null) => {
    setOrder((prev) => {
      const v = vehicles.find((x) => x.id === vid);
      const prevV = vehicles.find((x) => x.id === prev.vehicle_id);
      const kmWasAuto = prev.km_atual == null || (!!prevV && prev.km_atual === prevV.mileage);
      return {
        ...prev, vehicle_id: vid, mod_carro: v?.model ?? prev.mod_carro, km_atual: kmWasAuto ? v?.mileage ?? null : prev.km_atual,
        base_code: isNew ? baseCodeFromVehicleBase(v?.base) ?? prev.base_code : prev.base_code,
      };
    });
  };

  const uploadFile = async (file: File, category: UploadCategory, orderId: string = id): Promise<boolean> => {
    if (orderId === "new") { toast.error("Salve a OS antes de anexar arquivos."); return false; }
    if (file.size > MAX_FILE_SIZE) { toast.error("Arquivo maior que 20 MB."); return false; }
    setUploading(category);
    try {
      const dot = file.name.lastIndexOf(".");
      const ext = (dot > 0 ? file.name.slice(dot + 1) : file.type === "application/pdf" ? "pdf" : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${orderId}/${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("maintenance-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await (supabase as any).from("maintenance_photos")
        .insert({ order_id: orderId, category, storage_path: path, uploaded_by: user?.id ?? null }).select("id").single();
      if (insErr) { await supabase.storage.from("maintenance-photos").remove([path]); throw insErr; }
      const { data: signed } = await supabase.storage.from("maintenance-photos").createSignedUrl(path, 3600);
      setPhotos((prev) => [...prev, { id: (row as { id: string }).id, category, storage_path: path, url: signed?.signedUrl ?? "", source: "os" }]);
      toast.success(`${CATEGORY_LABEL[category]} anexado`);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setUploading(null);
    }
  };

  const logEvolution = async (orderId: string, st: MaintenanceStatus, observation: string) => {
    if (!user?.id) return;
    await supabase.from("maintenance_evolutions").insert({ order_id: orderId, user_id: user.id, status: st, observation });
  };

  // Salva o formulário + uma mudança opcional (status, pedido de peça…) e registra no histórico
  const persist = async (patch: Partial<Order> = {}, log?: string): Promise<boolean> => {
    let items = itemsList;
    const pending = itemsInput.trim().toUpperCase();
    if (pending) {
      items = [...items, pending];
      setItemsInput("");
      setOrder((p) => ({ ...p, items_replaced: items.join(", ") }));
    }
    const next: Order = { ...order, items_replaced: items.join(", "), ...patch };
    if (internal) next.workshop = INTERNAL_WORKSHOP;

    if (isNew) {
      if (!next.vehicle_id) { toast.error("Selecione o veículo."); return false; }
      if (internal && !next.failure_description?.trim()) { toast.error("Descreva o problema relatado."); return false; }
      if (!internal && !next.workshop?.trim()) { toast.error("Informe a oficina externa."); return false; }
    }

    setBusy(true);
    try {
      if (isNew) {
        const { data: num, error: ne } = await supabase.rpc("next_order_number", { _base: next.base_code });
        if (ne) throw new Error(ne.message);
        const payload = { ...toDbPayload(next), order_number: num as string, created_by: user?.id ?? null };
        const { data, error } = await supabase.from("maintenance_orders").insert(payload as never).select("id, order_number").single();
        if (error) throw new Error(error.message);
        await logEvolution(data.id, next.status, internal ? "OS interna aberta." : `OS externa registrada — ${next.workshop}.`);
        if (newOsFile) await uploadFile(newOsFile, "os_externa", data.id);
        toast.success(`OS ${data.order_number} ${internal ? "aberta" : "registrada"}`);
        nav({ to: "/admin/maintenance/$id", params: { id: data.id }, replace: true });
        return true;
      }

      const { error } = await supabase.from("maintenance_orders").update(toDbPayload(next) as never).eq("id", id);
      if (error) throw new Error(error.message);
      const statusChanged = next.status !== saved?.status;
      const message = log ?? (statusChanged ? `Status alterado para "${statusLabelFor(kind, next.status)}".` : null);
      if (message) { await logEvolution(id, next.status, message); loadEvolutions(); }
      setOrder(next); setSaved(next); setSnapshot(JSON.stringify(next));
      toast.success(statusChanged ? statusLabelFor(kind, next.status) : log ? "Registrado" : "Alterações salvas");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  // ---------- ações do fluxo ----------
  const startService = () => persist({ status: "em_execucao", data_entrada: order.data_entrada || nowParts().date, hora_entrada: order.hora_entrada || nowParts().time }, "Serviço iniciado.");

  const concludeInternal = () => {
    const items = [...itemsList, ...(itemsInput.trim() ? [itemsInput.trim()] : [])];
    const missing = [!items.length && "as peças/serviços realizados", order.km_atual == null && "o KM atual"].filter(Boolean);
    if (missing.length) {
      setOpenSections({ prazos: true, solucao: true });
      setTimeout(() => (items.length ? document.getElementById("os-km")?.focus() : itemInputRef.current?.focus()), 60);
      toast.error(`Para concluir, informe ${missing.join(" e ")}.`);
      return;
    }
    const n = nowParts();
    void persist({ status: "finalizada", data_saida: order.data_saida || n.date, hora_saida: order.hora_saida || n.time }, "OS concluída pelo mecânico.");
  };

  const requestPart = async (text: string) => {
    const ok = await persist({
      status: "aguardando_pecas", parts_needed: text, part_requested_at: new Date().toISOString(), part_requested_by: user?.id ?? null,
      part_decided_at: null, part_decided_by: null, part_purchase_due: null, part_arrival_due: null, part_arrived_at: null,
    }, `Peça solicitada ao Frotas ADM: ${text}`);
    if (ok) setModal(null);
  };

  const answerPart = () => {
    if (!decision.purchase || !decision.arrival) { toast.error("Informe a previsão de compra e a de chegada."); return; }
    if (decision.arrival < decision.purchase) { toast.error("A chegada não pode ser antes da compra."); return; }
    void persist(
      { part_purchase_due: decision.purchase, part_arrival_due: decision.arrival, part_decided_at: new Date().toISOString(), part_decided_by: user?.id ?? null },
      `Frotas ADM: compra prevista para ${fmtDate(decision.purchase)}, chegada prevista para ${fmtDate(decision.arrival)}.`,
    );
  };

  const partArrived = () => persist({ status: "em_execucao", part_arrived_at: new Date().toISOString() }, "Peça chegou — serviço retomado.");

  const cancelOs = async (reason: string) => {
    const ok = await persist({ status: "cancelada", cancel_reason: reason }, `OS cancelada pelo Frotas ADM. Motivo: ${reason}`);
    if (ok) setModal(null);
  };

  const reopen = () => persist({ status: internal ? "em_execucao" : "aberta", cancel_reason: null }, "OS reaberta pelo Frotas ADM.");

  const concludeExternal = () => {
    if (!photos.some((p) => p.category === "os_externa")) { toast.error("Anexe a OS emitida pela oficina antes de concluir."); return; }
    void persist({ status: "finalizada", data_saida: order.data_saida || nowParts().date }, "OS externa concluída.");
  };

  const removePhoto = async (p: Photo) => {
    if (!confirm(`Excluir este anexo (${CATEGORY_LABEL[p.category] ?? p.category})?`)) return;
    const { error } = await (supabase as any).from("maintenance_photos").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("maintenance-photos").remove([p.storage_path]);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text || isNew) return;
    setNoteBusy(true);
    await logEvolution(id, status, text);
    setNoteBusy(false);
    setNote("");
    loadEvolutions();
  };

  const confirmDelete = async (reason: string) => {
    setBusy(true);
    try {
      await softDeleteMaintenanceOrder({ data: { order_id: id, reason } });
      toast.success("OS movida para a lixeira");
      nav({ to: internal ? "/admin/maintenance" : "/admin/maintenance/externas" });
    } catch (e) { toast.error((e as Error).message); setBusy(false); }
  };

  const exportPdf = async () => {
    const doc = new jsPDF();
    const veh = vehicles.find((v) => v.id === order.vehicle_id);
    const drv = drivers.find((d) => d.id === order.driver_id) ?? extraDriver;
    await applyPdfBranding(doc, internal ? "OS INTERNA — OFICINA GRUPO TOMAZ" : "OS EXTERNA", `Nº ${orderNumber ?? "(nova)"} • ${statusLabelFor(kind, status)}`);
    autoTable(doc, {
      startY: 36, head: [["DADOS", "", "DADOS", ""]],
      body: [
        ["Placa", veh?.plate ?? "—", "Nº OS", orderNumber ?? "—"],
        ["Modelo", order.mod_carro || veh?.model || "—", "KM atual", order.km_atual?.toString() ?? "—"],
        ["Entrada", `${fmtDate(order.data_entrada)} ${order.hora_entrada?.slice(0, 5) ?? ""}`, "Saída", `${fmtDate(order.data_saida)} ${order.hora_saida?.slice(0, 5) ?? ""}`],
        ["Motorista", prettyName(drv?.full_name) || "—", "Oficina", order.workshop || "—"],
        internal ? ["Previsão de saída", fmtDate(order.previsao_saida), "Peça solicitada", order.parts_needed || "—"] : ["Valor total", order.valor_total != null ? brl(Number(order.valor_total)) : "—", "", ""],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [30, 40, 80], textColor: 255 }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 36 }, 2: { fontStyle: "bold", cellWidth: 36 } },
    });
    let y = (doc as any).lastAutoTable.finalY + 6;
    const section = (title: string, content: string, h: number) => {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setFillColor(30, 40, 80); doc.setTextColor(255);
      doc.rect(14, y, 182, 6, "F"); doc.text(title, 16, y + 4);
      doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      y += 6; doc.rect(14, y, 182, h);
      doc.text(doc.splitTextToSize(content || "—", 178), 16, y + 5);
      y += h + 4;
    };
    section("PROBLEMA RELATADO", order.failure_description ?? "", 30);
    section("SERVIÇO REALIZADO", order.solution_description ?? "", 30);
    section("PEÇAS / SERVIÇOS", order.items_replaced ?? "", 18);
    if (order.observations) section("OBSERVAÇÕES", order.observations, 16);
    y += 10; doc.setFontSize(9); doc.line(20, y, 90, y); doc.text("Assinatura do mecânico", 30, y + 5); doc.line(120, y, 190, y); doc.text("Assinatura do responsável", 130, y + 5);
    doc.save(`OS_${orderNumber ?? "nova"}.pdf`);
  };

  // ---------- dados derivados ----------
  const veh = vehicles.find((v) => v.id === order.vehicle_id);
  const vehicleOptions: SearchOption[] = vehicles
    .filter((v) => v.active !== false || v.id === order.vehicle_id)
    .map((v) => ({ value: v.id, label: v.plate, hint: [v.model, v.active === false ? "inativo" : null].filter(Boolean).join(" · ") || null }));
  const driverOptions: SearchOption[] = [...drivers, ...(extraDriver && !drivers.some((d) => d.id === extraDriver.id) ? [extraDriver] : [])]
    .map((d) => ({ value: d.id, label: prettyName(d.full_name) ?? d.id.slice(0, 8) }));
  const baseKnown = BASE_CODES.some((b) => b.code === order.base_code);
  const subtitle = isNew
    ? internal ? "Oficina Grupo Tomaz · preencha o essencial agora; o resto pode ser completado depois." : "Registre a OS que a oficina externa emitiu."
    : [veh?.plate, order.mod_carro || veh?.model, order.created_at && `aberta ${timeAgo(order.created_at)}`].filter(Boolean).join(" · ");
  const saveLabel = busy ? "Salvando…" : isNew ? (internal ? "Abrir OS" : "Registrar OS") : "Salvar";
  const savedOrder = saved ?? order;

  // ---------- cartão de andamento ----------
  const statusCard = (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Wrench className="size-4 text-primary" />Andamento</h2>
        <StatusBadge status={status} kind={kind} />
      </div>
      <StageStepper status={status} kind={kind} />

      {inTrash ? (
        <p className="text-xs text-muted-foreground">OS na lixeira — restaure-a pela Lixeira para voltar a editar.</p>
      ) : IS_STOPPED_STATUS(status) ? (
        <div className="space-y-2">
          <p className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-800 dark:text-rose-300">
            <strong>OS cancelada.</strong> {savedOrder.cancel_reason ? `Motivo: ${savedOrder.cancel_reason}` : ""}
          </p>
          {gestor && <Button variant="outline" className="w-full" onClick={() => void reopen()} disabled={busy}><RotateCcw />Reabrir OS</Button>}
        </div>
      ) : IS_DONE_STATUS(status) ? (
        <div className="space-y-2">
          <p className="rounded-md border border-green-500/30 bg-green-500/10 p-2.5 text-xs text-green-800 dark:text-green-300">
            <strong>OS concluída</strong>{savedOrder.data_saida ? ` em ${fmtDate(savedOrder.data_saida)}` : ""}.
          </p>
          {gestor && <Button variant="outline" className="w-full" onClick={() => void reopen()} disabled={busy}><RotateCcw />Reabrir OS</Button>}
        </div>
      ) : !internal ? (
        gestor ? (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Próximo passo</div>
            <Button className="w-full justify-between bg-green-600 text-white hover:bg-green-700" onClick={concludeExternal} disabled={busy}>
              Veículo voltou: concluir OS<CheckCircle2 />
            </Button>
            {!photos.some((p) => p.category === "os_externa") && <p className="text-[11px] text-muted-foreground">Para concluir, anexe a OS emitida pela oficina em Anexos.</p>}
          </div>
        ) : null
      ) : IS_WAITING_PART(status) ? (
        <div className="space-y-3">
          <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300"><Package className="size-4" />Peça solicitada</div>
            <p className="whitespace-pre-line">{savedOrder.parts_needed ?? "—"}</p>
            {savedOrder.part_requested_at && <p className="text-[11px] text-muted-foreground">Pedido {timeAgo(savedOrder.part_requested_at)}</p>}
            {!partPending(savedOrder) && (
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-amber-500/30 pt-2 text-xs">
                <div><span className="block text-muted-foreground">Compra prevista</span><strong>{fmtDate(savedOrder.part_purchase_due)}</strong></div>
                <div><span className="block text-muted-foreground">Chegada prevista</span><strong>{fmtDate(savedOrder.part_arrival_due)}</strong></div>
              </div>
            )}
          </div>

          {gestor && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">{partPending(savedOrder) ? "Responder ao mecânico" : "Alterar prazos"}</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Previsão de compra"><Input type="date" aria-label="Previsão de compra" value={decision.purchase} onChange={(e) => setDecision((d) => ({ ...d, purchase: e.target.value }))} /></Field>
                <Field label="Previsão de chegada"><Input type="date" aria-label="Previsão de chegada" value={decision.arrival} onChange={(e) => setDecision((d) => ({ ...d, arrival: e.target.value }))} /></Field>
              </div>
              <Button className="w-full" onClick={answerPart} disabled={busy}><CalendarClock />{partPending(savedOrder) ? "Confirmar prazos" : "Atualizar prazos"}</Button>
              <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setModal("cancelar")} disabled={busy}>
                <Ban />Não seguir com a OS
              </Button>
            </div>
          )}
          {!gestor && partPending(savedOrder) && <p className="text-xs text-muted-foreground">Aguardando o Frotas ADM informar os prazos de compra e chegada.</p>}
          {!partPending(savedOrder) && (
            <Button className="w-full justify-between" variant={gestor ? "secondary" : "default"} onClick={() => void partArrived()} disabled={busy}>
              Peça chegou: retomar serviço<Play />
            </Button>
          )}
        </div>
      ) : status === "aberta" || !["em_execucao", "em_manutencao", "teste_final"].includes(status) ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Próximo passo</div>
          <Button className="w-full justify-between" onClick={() => void startService()} disabled={busy}>Iniciar serviço<Play /></Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => setModal("peca")} disabled={busy}>Solicitar peça<Package /></Button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Próximo passo</div>
          <Button className="w-full justify-between bg-green-600 text-white hover:bg-green-700" onClick={concludeInternal} disabled={busy}>Concluir OS<CheckCircle2 /></Button>
          <Button variant="outline" className="w-full justify-between" onClick={() => setModal("peca")} disabled={busy}>Falta peça: solicitar ao Frotas ADM<Package /></Button>
          <p className="text-[11px] text-muted-foreground">Para concluir: peças/serviços realizados e o KM atual.</p>
        </div>
      )}
    </Card>
  );

  const canDeletePhotos = !locked;
  const attachmentsCard = (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Paperclip className="size-4 text-primary" />Anexos <span className="font-normal text-muted-foreground">({photos.length})</span></h2>
      {!internal && !photos.some((p) => p.category === "os_externa") && !inTrash && (
        <p className="rounded-md border border-violet-500/30 bg-violet-500/10 p-2.5 text-xs text-violet-800 dark:text-violet-300">Anexe a OS emitida pela oficina externa (PDF ou foto).</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {UPLOADS[kind].map((c) => {
          const disabled = inTrash || uploading !== null || (!internal && !gestor);
          return (
            <label key={c.key} className={cn(buttonVariants({ variant: c.key === "os_externa" ? "default" : "outline", size: "sm" }), "cursor-pointer justify-start", disabled && "pointer-events-none opacity-50")}>
              <input type="file" accept="image/*,application/pdf" className="sr-only" disabled={disabled}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadFile(f, c.key); }} />
              {uploading === c.key ? <Clock className="animate-pulse" /> : <Plus />}
              <span className="truncate">{uploading === c.key ? "Enviando…" : c.label}</span>
            </label>
          );
        })}
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo ainda. Fotos ou PDFs de até 20 MB.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const isPdf = p.storage_path.toLowerCase().endsWith(".pdf");
            const label = p.source === "checklist" ? `Checklist: ${p.category}` : CATEGORY_LABEL[p.category] ?? p.category;
            return (
              <div key={`${p.source}-${p.id}`} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/40">
                <a href={p.url} target="_blank" rel="noreferrer" title={label} className="grid h-full w-full place-items-center">
                  {isPdf ? <span className="flex flex-col items-center gap-1 text-primary"><FileText className="size-6" /><span className="text-[10px] font-semibold">PDF</span></span>
                    : <img src={p.url} alt={label} className="h-full w-full object-cover" loading="lazy" />}
                </a>
                <span className={cn("pointer-events-none absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[10px] font-semibold text-white",
                  p.category === "os_externa" ? "bg-violet-600/90" : p.category === "orcamento" ? "bg-primary/90" : p.source === "checklist" ? "bg-amber-600/90" : "bg-black/60")}>
                  {label}
                </span>
                {p.source === "os" && canDeletePhotos && (
                  <button type="button" aria-label={`Excluir anexo ${label}`} onClick={() => removePhoto(p)}
                    className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white transition-opacity hover:bg-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );

  const historyCard = (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><History className="size-4 text-primary" />Histórico</h2>
      {!inTrash && (
        <div className="space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={internal ? "Registrar uma atualização (ex.: aguardando alinhamento)" : "Registrar uma atualização"} />
          <Button size="sm" variant="secondary" className="w-full" disabled={!note.trim() || noteBusy} onClick={addNote}>{noteBusy ? "Registrando…" : "Registrar atualização"}</Button>
        </div>
      )}
      {evolutions.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum registro ainda. Cada passo da OS entra aqui automaticamente.</p>
      ) : (
        <ol className="relative ml-1.5 max-h-[28rem] space-y-4 overflow-auto border-l border-border pr-1">
          {evolutions.map((e) => (
            <li key={e.id} className="ml-4">
              <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary/70 ring-2 ring-card" />
              <div className="flex flex-wrap items-center gap-2">
                {e.status && <StatusBadge status={e.status} kind={kind} />}
                <span className="text-[11px] text-muted-foreground" title={new Date(e.created_at).toLocaleString("pt-BR")}>{timeAgo(e.created_at)}</span>
              </div>
              <div className="mt-0.5 text-xs font-medium">{e.user_name ?? "—"}</div>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{e.observation}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );

  // ---------- seções do formulário ----------
  const vehicleSection = (
    <Section icon={Truck} title={internal ? "Veículo e motorista" : "Veículo e oficina"} hint={internal ? `Oficina: ${INTERNAL_WORKSHOP}` : "Placa e oficina externa"} locked={locked}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Veículo" required={isNew} className="sm:col-span-2">
          <SearchSelect value={order.vehicle_id} onChange={onVehicleChange} options={vehicleOptions} placeholder="Buscar placa ou modelo…" searchPlaceholder="Digite a placa ou o modelo" emptyText="Nenhum veículo encontrado." disabled={locked} />
        </Field>
        {!internal && (
          <Field label="Oficina externa" required={isNew} className="sm:col-span-2">
            <Input list="os-workshop-suggestions" value={order.workshop ?? ""} onChange={(e) => set("workshop", e.target.value)} placeholder="Ex.: Hidráulica Lopes" />
            <datalist id="os-workshop-suggestions">{suggestions.workshops.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
        )}
        {internal && (
          <Field label="Motorista">
            <SearchSelect value={order.driver_id} onChange={(v) => set("driver_id", v)} options={driverOptions} placeholder="Buscar motorista…" searchPlaceholder="Digite o nome" emptyText="Nenhum motorista encontrado." disabled={locked} />
          </Field>
        )}
        <Field label="Categoria">
          <ChoiceGroup value={(order.maintenance_category ?? "corretiva") as "corretiva" | "preventiva" | "planejada"} onChange={(v) => set("maintenance_category", v)}
            options={[["corretiva", "Corretiva"], ["preventiva", "Preventiva"], ["planejada", "Planejada"]]} label="Categoria da manutenção" />
        </Field>
        <Field label="KM atual" required={internal && !isNew} hint={internal ? "Atualiza a quilometragem do veículo" : undefined}>
          <Input id="os-km" type="number" inputMode="numeric" min={0} value={order.km_atual ?? ""} onChange={(e) => set("km_atual", numOrNull(e.target.value))} />
        </Field>
        <Field label="Base" hint={isNew ? "Preenchida pelo veículo; faz parte do nº da OS" : "Definida na abertura da OS"}>
          <select value={order.base_code} onChange={(e) => set("base_code", e.target.value)} disabled={!isNew} className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm disabled:opacity-70">
            {!baseKnown && <option value={order.base_code}>{order.base_code}</option>}
            {BASE_CODES.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.label}</option>)}
          </select>
        </Field>
      </div>
    </Section>
  );

  const problemSection = (
    <Section icon={AlertTriangle} title={internal ? "Problema relatado" : "Serviço da oficina"} hint={internal ? "O que precisa ser resolvido" : "Motivo e o que a oficina fez"} locked={locked}>
      <Field label={internal ? "Descrição do problema" : "Motivo / serviço contratado"} required={isNew && internal}>
        <Textarea rows={internal ? 4 : 3} value={order.failure_description ?? ""} onChange={(e) => set("failure_description", e.target.value)}
          placeholder={internal ? "O que foi observado? Ex.: barulho no freio dianteiro" : "Ex.: retífica do motor"} />
      </Field>
      {order.checklist_id && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ClipboardCheck className="size-3.5" />Vinculada ao checklist do motorista — as fotos das falhas aparecem em Anexos.</p>
      )}
      <Field label="Tipo de serviço">
        <Input list="os-service-suggestions" value={order.service_type ?? ""} onChange={(e) => set("service_type", e.target.value)} placeholder="Ex.: Freios" />
        <datalist id="os-service-suggestions">{suggestions.services.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <Field label="Observações"><Textarea rows={2} value={order.observations ?? ""} onChange={(e) => set("observations", e.target.value)} /></Field>
    </Section>
  );

  const internalPrazos = (
    <Section icon={CalendarClock} title="Prazos na oficina" hint="Previsão de saída, entrada e saída do veículo" open={openSections.prazos} onToggle={() => toggleSection("prazos")} locked={locked}
      filled={[countFilled(order.previsao_saida, order.data_entrada, order.data_saida), 3]}>
      <Field label="Previsão de saída da oficina" hint="Quando o veículo deve estar liberado">
        <Input type="date" aria-label="Previsão de saída da oficina" value={order.previsao_saida ?? ""} onChange={(e) => set("previsao_saida", e.target.value)} className="sm:max-w-xs" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Entrada" date={order.data_entrada} time={order.hora_entrada} onChange={(d, t) => setOrder((p) => ({ ...p, data_entrada: d, hora_entrada: t }))} />
        <DateTimeField label="Saída" date={order.data_saida} time={order.hora_saida} onChange={(d, t) => setOrder((p) => ({ ...p, data_saida: d, hora_saida: t }))} />
        <Field label="Combustível na chegada">
          <div className="flex flex-wrap gap-1.5">
            {[...FUEL_LEVELS, ...(order.combustivel_chegada && !FUEL_LEVELS.includes(order.combustivel_chegada) ? [order.combustivel_chegada] : [])].map((l) => {
              const on = order.combustivel_chegada === l;
              return (
                <button key={l} type="button" aria-pressed={on} onClick={() => set("combustivel_chegada", on ? "" : l)}
                  className={cn("h-9 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed", on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted")}>
                  {l}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Validade do óleo"><Input value={order.validade_oleo ?? ""} onChange={(e) => set("validade_oleo", e.target.value)} placeholder="KM ou data" /></Field>
      </div>
    </Section>
  );

  const externalPrazos = (
    <Section icon={CalendarClock} title="Datas e valor" hint="Ida e volta da oficina e valor da OS" locked={locked}>
      <div className="grid gap-3 sm:grid-cols-2">
        <DateTimeField label="Entrada na oficina" date={order.data_entrada} time={order.hora_entrada} onChange={(d, t) => setOrder((p) => ({ ...p, data_entrada: d, hora_entrada: t }))} />
        <DateTimeField label="Saída da oficina" date={order.data_saida} time={order.hora_saida} onChange={(d, t) => setOrder((p) => ({ ...p, data_saida: d, hora_saida: t }))} />
        <Field label="Valor total (R$)">
          <Input type="number" inputMode="decimal" min={0} step="0.01" value={order.valor_total ?? ""} onChange={(e) => set("valor_total", numOrNull(e.target.value))} />
        </Field>
      </div>
      {isNew && (
        <Field label="OS da oficina (PDF ou foto)" hint="Pode anexar agora ou depois, na ficha da OS">
          <input type="file" accept="image/*,application/pdf" onChange={(e) => setNewOsFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20" />
        </Field>
      )}
    </Section>
  );

  const solutionSection = (
    <Section icon={CheckCircle2} title="Peças e serviço realizado" hint="Obrigatório para concluir a OS" open={openSections.solucao} onToggle={() => toggleSection("solucao")} locked={locked}
      filled={[countFilled(order.solution_description, order.items_replaced), 2]}>
      <Field label="O que foi feito"><Textarea rows={3} value={order.solution_description ?? ""} onChange={(e) => set("solution_description", e.target.value)} placeholder="Descreva o serviço realizado" /></Field>
      <Field label="Peças / serviços" required hint="Tecle Enter ou vírgula para separar. Se não trocou peça, escreva o serviço (ex.: REGULAGEM).">
        <ItemsInput items={itemsList} input={itemsInput} onInput={setItemsInput} onAdd={addItem} onRemove={(i) => updateItems(itemsList.filter((_, idx) => idx !== i))} inputRef={itemInputRef} />
      </Field>
      <Field label="Observação final"><Textarea rows={2} value={order.final_observation ?? ""} onChange={(e) => set("final_observation", e.target.value)} placeholder="Recomendações, garantia, próxima revisão…" /></Field>
    </Section>
  );

  return (
    <div className={cn("mx-auto space-y-4 pb-24 md:pb-6", isNew ? "max-w-3xl" : "max-w-6xl")}>
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 shrink-0">
          <Link to={internal ? "/admin/maintenance" : "/admin/maintenance/externas"} aria-label="Voltar para a lista"><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold md:text-2xl">{isNew ? (internal ? "Nova OS interna" : "Registrar OS externa") : `OS ${orderNumber ?? ""}`}</h1>
            {loaded && <TypeBadge type={kind} />}
            {!isNew && loaded && <StatusBadge status={status} kind={kind} />}
          </div>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {!isNew && <Button variant="outline" onClick={exportPdf} disabled={!loaded}><FileDown />PDF</Button>}
          {!locked && <Button onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button>}
        </div>
        {!isNew && !inTrash && (isAdmin || (gestor && !closed)) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="shrink-0" aria-label="Mais ações"><MoreVertical /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {gestor && !closed && <DropdownMenuItem onSelect={() => setModal("cancelar")}><Ban />Cancelar OS</DropdownMenuItem>}
              {isAdmin && <DropdownMenuItem onSelect={() => setModal("lixeira")} className="text-destructive focus:text-destructive"><Trash2 />Mover para a lixeira</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {existingOs && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-blue-600" />
          <span className="flex-1">Este checklist já tem a OS <strong>{existingOs.order_number}</strong>.</span>
          <Button asChild size="sm" variant="outline" className="bg-background"><Link to="/admin/maintenance/$id" params={{ id: existingOs.id }}>Abrir OS existente</Link></Button>
        </div>
      )}
      {inTrash && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" /><span>Esta OS está na <strong>lixeira</strong> e não pode ser editada.</span>
        </div>
      )}
      {!inTrash && internal && partPending(savedOrder) && !isNew && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <Package className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <span><strong>Pedido de peça aguardando o Frotas ADM.</strong> {gestor ? "Informe a previsão de compra e chegada em Andamento, ou decida não seguir com a OS." : "Você será avisado aqui quando os prazos forem informados."}</span>
        </div>
      )}

      {!loaded ? <FormSkeleton /> : (
        <div className={cn("grid grid-cols-1 gap-4", !isNew && "lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:items-start")}>
          {!isNew && <div className="lg:col-start-2 lg:row-start-1">{statusCard}</div>}
          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {vehicleSection}
            {problemSection}
            {internal ? internalPrazos : externalPrazos}
            {internal && !isNew && solutionSection}
            {isNew && (
              <div className="hidden justify-end md:flex"><Button size="lg" onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button></div>
            )}
          </div>
          {!isNew && <div className="space-y-4 lg:col-start-2 lg:row-start-2">{attachmentsCard}{historyCard}</div>}
        </div>
      )}

      {dirty && !locked && (
        <div role="status" className="fixed bottom-6 right-6 z-30 hidden items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg md:flex">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden />
          <span className="text-sm font-medium">Alterações não salvas</span>
          <Button variant="ghost" size="sm" onClick={discardChanges} disabled={busy}>Descartar</Button>
          <Button size="sm" onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {!isNew && <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={exportPdf} disabled={!loaded} aria-label="Baixar PDF"><FileDown /></Button>}
        {!locked && (
          <Button className="h-11 flex-1" onClick={() => void persist()} disabled={saveDisabled}>
            <Save />{saveLabel}{dirty && !busy && <span className="ml-1 size-2 rounded-full bg-amber-400" aria-label="Alterações não salvas" />}
          </Button>
        )}
      </div>

      {modal === "peca" && <PartRequestModal busy={busy} initial={savedOrder.parts_needed ?? ""} onClose={() => setModal(null)} onConfirm={requestPart} />}
      {modal === "cancelar" && (
        <ReasonModal title="Não seguir com a OS" text="A OS será cancelada e o motivo fica registrado no histórico." confirmLabel="Cancelar OS" busy={busy} onClose={() => setModal(null)} onConfirm={cancelOs} />
      )}
      {modal === "lixeira" && <DeleteOSModal busy={busy} onClose={() => setModal(null)} onConfirm={confirmDelete} />}
    </div>
  );
}
