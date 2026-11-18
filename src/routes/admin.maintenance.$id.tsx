import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ComponentType, type ReactNode, type RefObject } from "react";
import { supabase } from "@/integrations/supabase/client";
import { approveMaintenanceOrder, denyMaintenanceOrder, softDeleteMaintenanceOrder } from "@/lib/maintenance.functions";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Ban, Calculator, CheckCircle2, ChevronDown, ClipboardCheck, Clock,
  FileDown, FileText, History, LogIn, MoreVertical, Paperclip, Plus, Save, Trash2, Truck, Wrench, X as XIcon,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { applyPdfBranding, BASE_CODES } from "@/lib/admin-pdf";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  FINAL_STATUSES, IS_DONE_STATUS, IS_STOPPED_STATUS, LEGACY_STATUSES, NEXT_STEPS, REQUIRES_ITEMS, STATUS_OPTIONS,
  actionLabel, stageIndex, statusLabel, timeAgo, type MaintenanceStatus,
} from "@/lib/maintenance";
import { SearchSelect, type SearchOption } from "@/components/search-select";
import { StageStepper, StatusBadge, TypeBadge } from "@/components/maintenance-ui";

export const Route = createFileRoute("/admin/maintenance/$id")({
  validateSearch: (s: Record<string, unknown>): { checklist?: string; vehicle?: string; reason?: string } => ({
    checklist: typeof s.checklist === "string" ? s.checklist : undefined,
    vehicle: typeof s.vehicle === "string" ? s.vehicle : undefined,
    reason: typeof s.reason === "string" ? s.reason : undefined,
  }),
  component: OrderForm,
});

type Order = {
  id?: string; order_number?: string; created_at?: string; deleted_at?: string | null;
  order_type: "SMI" | "SMV"; base_code: string;
  vehicle_id: string | null; driver_id: string | null; checklist_id: string | null;
  failure_description: string | null; service_type: string | null; workshop: string | null;
  status: MaintenanceStatus; observations: string | null;
  maintenance_category?: string | null; validade_oleo?: string | null; km_atual?: number | null;
  combustivel_chegada?: string | null; data_entrada?: string | null; hora_entrada?: string | null;
  data_saida?: string | null; hora_saida?: string | null; mod_carro?: string | null;
  solution_description?: string | null; items_replaced?: string | null;
  labor_description?: string | null; labor_hours?: number | null; labor_cost?: number | null;
  parts_needed?: string | null; parts_supplier?: string | null; parts_cost?: number | null;
  final_observation?: string | null;
  approved_at?: string | null; approved_by?: string | null; denial_reason?: string | null;
};

type Photo = { id: string; category: string; storage_path: string; url: string; source: "os" | "checklist" };
type VehicleOpt = { id: string; plate: string; model: string | null; base: string | null; mileage: number | null; active: boolean | null };
type Person = { id: string; full_name: string | null };
type Evolution = { id: string; created_at: string; status: string | null; observation: string; user_id: string | null; user_name?: string | null };
type UploadCategory = "orcamento" | "falha" | "execucao" | "conclusao";
type SectionKey = "entrada" | "orcamento" | "solucao";

const UPLOAD_CATEGORIES: { key: UploadCategory; label: string }[] = [
  { key: "orcamento", label: "Orçamento" },
  { key: "falha", label: "Foto da falha" },
  { key: "execucao", label: "Execução" },
  { key: "conclusao", label: "Conclusão" },
];
const CATEGORY_LABEL: Record<string, string> = { orcamento: "Orçamento", falha: "Falha", execucao: "Execução", conclusao: "Conclusão" };
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const FUEL_LEVELS = ["Reserva", "1/4", "1/2", "3/4", "Cheio"];
const SERVICE_SUGGESTIONS = [
  "Mecânica", "Elétrica", "Funilaria e pintura", "Pneus", "Freios", "Suspensão",
  "Hidráulica", "Troca de óleo", "Revisão preventiva", "Ar-condicionado",
];

const emptyOrder = (checklistId?: string): Order => ({
  order_type: "SMI", base_code: "VOT", vehicle_id: null, driver_id: null, checklist_id: checklistId ?? null,
  failure_description: "", service_type: "", workshop: "", status: "aberta", observations: "",
  maintenance_category: "corretiva", validade_oleo: "", km_atual: null,
  combustivel_chegada: "", data_entrada: "", hora_entrada: "", data_saida: "", hora_saida: "",
  mod_carro: "", solution_description: "", items_replaced: "", denial_reason: null,
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
  for (const v of values) {
    const t = v?.trim();
    if (t && !byKey.has(normalize(t))) byKey.set(normalize(t), t);
  }
  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const isFilled = (v: unknown) => v !== null && v !== undefined && v !== "";
const countFilled = (...vals: unknown[]) => vals.filter(isFilled).length;

function defaultOpenSections(o: Order): Record<SectionKey, boolean> {
  const st = stageIndex(o.status);
  return {
    entrada: st >= 3 || countFilled(o.data_entrada, o.hora_entrada, o.data_saida, o.hora_saida, o.combustivel_chegada, o.validade_oleo) > 0,
    orcamento: st === 1 || st === 2 || countFilled(o.labor_description, o.labor_hours, o.labor_cost, o.parts_needed, o.parts_supplier, o.parts_cost) > 0,
    solucao: st >= 3 || countFilled(o.solution_description, o.items_replaced, o.final_observation) > 0,
  };
}

function nowParts() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numOrNull = (v: string) => (v === "" ? null : Number(v));
const isFinal = (s: string) => (FINAL_STATUSES as readonly string[]).includes(s);

function useEscape(onEscape: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onEscape(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onEscape]);
}

// Anexos da OS + fotos das falhas do checklist de origem (URLs assinadas em lote)
async function fetchAllPhotos(orderId: string, checklistId: string | null): Promise<Photo[]> {
  const list: Photo[] = [];
  const { data: pData } = await supabase
    .from("maintenance_photos")
    .select("id, category, storage_path")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (pData?.length) {
    const { data: signed } = await supabase.storage
      .from("maintenance-photos")
      .createSignedUrls(pData.map((r) => r.storage_path).filter((p): p is string => !!p), 3600);
    const urlMap = new Map((signed ?? []).map((s) => [s.path, s.signedUrl ?? ""]));
    for (const r of pData) {
      if (!r.storage_path) continue;
      list.push({ id: r.id, category: r.category ?? "", storage_path: r.storage_path, url: urlMap.get(r.storage_path) ?? "", source: "os" });
    }
  }
  if (checklistId) {
    const { data: cData } = await (supabase as any)
      .from("checklist_responses")
      .select("id, photo_url, checklist_items(name)")
      .eq("checklist_id", checklistId)
      .not("photo_url", "is", null);
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
    <div className={cn("space-y-1.5 min-w-0", className)}>
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
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-8 rounded px-2 text-xs font-medium truncate transition-colors disabled:cursor-not-allowed",
            value === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
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
      <span className="size-8 rounded-lg bg-primary/10 text-primary grid place-items-center shrink-0"><Icon className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="block text-xs text-muted-foreground truncate">{hint}</span>}
      </span>
      {filled && (
        <span className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
          filled[0] === filled[1] ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground",
        )}>
          {filled[0]}/{filled[1]}
        </span>
      )}
    </>
  );
  return (
    <Card className="overflow-hidden">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={isOpen} className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/40 transition-colors">
          {heading}
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
        </button>
      ) : (
        <div className="flex items-center gap-3 p-4 pb-1">{heading}</div>
      )}
      {isOpen && (
        <fieldset disabled={locked} className="min-w-0 space-y-3 p-4 pt-3 disabled:opacity-70">
          {children}
        </fieldset>
      )}
    </Card>
  );
}

function DateTimeField({ label, date, time, onChange }: {
  label: string; date?: string | null; time?: string | null; onChange: (date: string, time: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input type="date" value={date ?? ""} onChange={(e) => onChange(e.target.value, time ?? "")} className="flex-1 min-w-0" />
        <Input type="time" value={time ? time.slice(0, 5) : ""} onChange={(e) => onChange(date ?? "", e.target.value)} className="w-[6.5rem] shrink-0" />
        <Button type="button" variant="outline" className="shrink-0 px-3" onClick={() => { const n = nowParts(); onChange(n.date, n.time); }}>
          Agora
        </Button>
      </div>
    </Field>
  );
}

function ItemsInput({ items, input, onInput, onAdd, onRemove, inputRef }: {
  items: string[]; input: string; onInput: (v: string) => void; onAdd: () => void; onRemove: (i: number) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="rounded-md border border-border bg-input p-2 space-y-2 focus-within:ring-2 focus-within:ring-ring/40" onClick={() => inputRef.current?.focus()}>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={`${it}-${i}`} className="inline-flex items-center gap-1 rounded bg-primary/15 py-1 pl-2 pr-1 text-xs font-semibold text-primary">
              {it}
              <button
                type="button"
                aria-label={`Remover ${it}`}
                onClick={(e) => { e.stopPropagation(); onRemove(i); }}
                className="rounded p-0.5 hover:bg-primary/20 hover:text-destructive"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); onAdd(); } }}
          enterKeyHint="done"
          placeholder={items.length ? "Adicionar outro item…" : "Ex.: PASTILHA DE FREIO"}
          className="flex-1 min-w-0 bg-transparent py-1 text-sm outline-none"
        />
        <Button type="button" size="sm" variant="secondary" disabled={!input.trim()} onClick={(e) => { e.stopPropagation(); onAdd(); }}>
          <Plus />Adicionar
        </Button>
      </div>
    </div>
  );
}

function ModalShell({ onClose, children, z = "z-50" }: { onClose: () => void; children: ReactNode; z?: string }) {
  useEscape(onClose);
  return (
    <div className={cn("fixed inset-0 bg-black/60 grid place-items-center p-4", z)} onClick={onClose}>
      <Card role="dialog" aria-modal="true" className="w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        {children}
      </Card>
    </div>
  );
}

function BudgetPromptModal({ busy, onCancel, onSkip, onSend }: { busy: boolean; onCancel: () => void; onSkip: () => void; onSend: (f: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  return (
    <ModalShell onClose={onCancel} z="z-[60]">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg flex items-center gap-2"><Paperclip className="size-5 text-primary" />Enviar para aprovação</h3>
        <Button size="icon" variant="ghost" onClick={onCancel} aria-label="Fechar"><XIcon /></Button>
      </div>
      <p className="text-sm text-muted-foreground">Anexe a foto ou o PDF do orçamento para o Master avaliar. Ele será notificado assim que a OS for enviada.</p>
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20"
      />
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" className="flex-1" onClick={onSkip} disabled={busy}>Enviar sem anexo</Button>
        <Button className="flex-1" disabled={busy} onClick={() => (file ? onSend(file) : toast.error("Selecione um arquivo ou use \"Enviar sem anexo\"."))}>
          {busy ? "Enviando…" : "Anexar e enviar"}
        </Button>
      </div>
    </ModalShell>
  );
}

function DenyModal({ busy, onClose, onConfirm }: { busy: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell onClose={onClose}>
      <h3 className="font-bold text-lg text-destructive flex items-center gap-2"><Ban className="size-5" />Negar ordem de serviço</h3>
      <p className="text-sm text-muted-foreground">Explique o motivo. Ele fica registrado no histórico da OS.</p>
      <Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: orçamento acima do esperado, peça disponível em estoque…" autoFocus />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => (reason.trim() ? onConfirm(reason.trim()) : toast.error("Informe o motivo da negação."))}>
          {busy ? "Salvando…" : "Confirmar negação"}
        </Button>
      </div>
    </ModalShell>
  );
}

function DeleteOSModal({ onClose, onConfirm, busy, isFinalized }: { onClose: () => void; onConfirm: (reason: string) => void; busy: boolean; isFinalized: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <ModalShell onClose={onClose} z="z-[70]">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-lg text-destructive flex items-center gap-2"><Trash2 className="size-5" />Mover para a lixeira</h3>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Fechar"><XIcon /></Button>
      </div>
      {isFinalized && (
        <div className="rounded-md border border-orange-300 bg-orange-500/10 p-3 text-xs text-orange-900 dark:text-orange-300 flex gap-2">
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-orange-500" />
          <span>Esta OS está <strong>finalizada</strong>. Ao excluir, o vínculo financeiro será removido automaticamente do módulo Financeiro.</span>
        </div>
      )}
      <p className="text-sm text-muted-foreground">A OS sai do painel e pode ser restaurada pela Lixeira. Informe o motivo (obrigatório).</p>
      <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo da exclusão…" autoFocus />
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>Cancelar</Button>
        <Button variant="destructive" className="flex-1" disabled={busy} onClick={() => (reason.trim() ? onConfirm(reason) : toast.error("O motivo é obrigatório."))}>
          {busy ? "Excluindo…" : "Mover para a lixeira"}
        </Button>
      </div>
    </ModalShell>
  );
}

function FormSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

// ---------------- Ficha da OS ----------------

function OrderForm() {
  const { id } = useParams({ from: "/admin/maintenance/$id" });
  const { checklist: fromChecklistId, vehicle: fromVehicleId, reason: fromReason } = Route.useSearch();
  const nav = useNavigate();
  const { user, isAdmin, isMaster } = useAuth();
  const isNew = id === "new";

  const [order, setOrder] = useState<Order>(() => emptyOrder(fromChecklistId));
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [savedStatus, setSavedStatus] = useState<MaintenanceStatus>("aberta");
  const [snapshot, setSnapshot] = useState("");
  const [loaded, setLoaded] = useState(isNew);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [drivers, setDrivers] = useState<Person[]>([]);
  const [extraDriver, setExtraDriver] = useState<Person | null>(null);
  const [suggestions, setSuggestions] = useState<{ services: string[]; workshops: string[] }>({ services: SERVICE_SUGGESTIONS, workshops: [] });
  const [existingOs, setExistingOs] = useState<{ id: string; order_number: string } | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [evolutions, setEvolutions] = useState<Evolution[]>([]);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({ entrada: false, orcamento: false, solucao: false });
  const [itemsInput, setItemsInput] = useState("");
  const itemInputRef = useRef<HTMLInputElement>(null);
  const [manualStatus, setManualStatus] = useState<MaintenanceStatus>("aberta");
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [showDenyModal, setShowDenyModal] = useState(false);
  const [budgetPrompt, setBudgetPrompt] = useState(false);
  const [uploading, setUploading] = useState<UploadCategory | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const set = <K extends keyof Order>(key: K, value: Order[K]) => setOrder((prev) => ({ ...prev, [key]: value }));
  const toggleSection = (k: SectionKey) => setOpenSections((p) => ({ ...p, [k]: !p[k] }));

  const loadEvolutions = async () => {
    if (isNew) return;
    const { data } = await supabase
      .from("maintenance_evolutions")
      .select("id, created_at, status, observation, user_id")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as Evolution[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean) as string[]));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: dd } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameById = Object.fromEntries((dd ?? []).map((p) => [p.id, p.full_name ?? "—"]));
    }
    setEvolutions(rows.map((r) => ({ ...r, user_name: r.user_id ? nameById[r.user_id] ?? null : null })));
  };

  // Listas de apoio: veículos, motoristas e sugestões já usadas em outras OS
  useEffect(() => { (async () => {
    const [{ data: vs }, { data: ds }, { data: used }] = await Promise.all([
      supabase.from("vehicles").select("id, plate, model, base, mileage, active").order("plate"),
      supabase.from("profiles").select("id, full_name").eq("driver_active", true).order("full_name"),
      supabase.from("maintenance_orders").select("service_type, workshop").is("deleted_at", null).limit(1000),
    ]);
    setVehicles((vs ?? []) as VehicleOpt[]);
    setDrivers((ds ?? []) as Person[]);
    const usedRows = (used ?? []) as Array<{ service_type: string | null; workshop: string | null }>;
    setSuggestions({
      services: uniqueSorted([...SERVICE_SUGGESTIONS, ...usedRows.map((u) => u.service_type)]),
      workshops: uniqueSorted(usedRows.map((u) => u.workshop)),
    });
  })(); }, []);

  // Nova OS a partir de um checklist com falha ou de um alerta do veículo
  useEffect(() => {
    if (!isNew) return;
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
          .map((r) => `• ${r.checklist_items?.name ?? "Item"}${r.observation ? `: ${r.observation}` : ""}`)
          .join("\n");
        setOrder((prev) => ({
          ...prev,
          checklist_id: fromChecklistId,
          vehicle_id: cl.vehicle_id ?? prev.vehicle_id,
          driver_id: cl.driver_id ?? prev.driver_id,
          km_atual: cl.odometer_start ?? veh?.mileage ?? prev.km_atual,
          mod_carro: veh?.model ?? prev.mod_carro,
          base_code: baseCodeFromVehicleBase(veh?.base) ?? prev.base_code,
          failure_description: failureText || prev.failure_description,
        }));
      } else if (fromVehicleId) {
        const { data: veh } = await supabase.from("vehicles").select("model, base, mileage").eq("id", fromVehicleId).maybeSingle();
        setOrder((prev) => ({
          ...prev,
          vehicle_id: fromVehicleId,
          km_atual: veh?.mileage ?? prev.km_atual,
          mod_carro: veh?.model ?? prev.mod_carro,
          base_code: baseCodeFromVehicleBase(veh?.base) ?? prev.base_code,
          failure_description: fromReason ?? prev.failure_description,
          maintenance_category: fromReason ? "preventiva" : prev.maintenance_category,
        }));
      }
    })();
  }, [isNew, fromChecklistId, fromVehicleId, fromReason]);

  // OS existente
  useEffect(() => {
    if (isNew) { setLoaded(true); return; }
    let alive = true;
    setLoaded(false);
    setExistingOs(null);
    (async () => {
      const { data, error } = await supabase.from("maintenance_orders").select("*").eq("id", id).maybeSingle();
      if (!alive) return;
      if (error || !data) { toast.error(error ? "Erro ao carregar a OS: " + error.message : "OS não encontrada."); return; }
      const o = data as unknown as Order;
      setOrder(o);
      setOrderNumber(o.order_number ?? null);
      setSavedStatus(o.status);
      setManualStatus(o.status);
      setSnapshot(JSON.stringify(o));
      setOpenSections(defaultOpenSections(o));
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
  const awaitingApproval = savedStatus === "aguardando_aprovacao";
  const locked = awaitingApproval || inTrash;
  const closed = IS_DONE_STATUS(savedStatus) || IS_STOPPED_STATUS(savedStatus);
  const itemsList = splitItems(order.items_replaced);
  const dirty = !isNew && loaded && (JSON.stringify(order) !== snapshot || itemsInput.trim() !== "");
  const saveDisabled = !loaded || busy || approvalBusy || locked;

  const discardChanges = () => {
    if (!snapshot) return;
    setOrder(JSON.parse(snapshot) as Order);
    setItemsInput("");
  };

  const updateItems = (list: string[]) => set("items_replaced", list.join(", "));
  const addItem = () => {
    const v = itemsInput.trim().toUpperCase();
    if (v) updateItems([...itemsList, v]);
    setItemsInput("");
    itemInputRef.current?.focus();
  };

  const onVehicleChange = (vid: string | null) => {
    setOrder((prev) => {
      const v = vehicles.find((x) => x.id === vid);
      const prevV = vehicles.find((x) => x.id === prev.vehicle_id);
      const kmWasAuto = prev.km_atual == null || (!!prevV && prev.km_atual === prevV.mileage);
      return {
        ...prev,
        vehicle_id: vid,
        mod_carro: v?.model ?? prev.mod_carro,
        km_atual: kmWasAuto ? v?.mileage ?? null : prev.km_atual,
        base_code: isNew ? baseCodeFromVehicleBase(v?.base) ?? prev.base_code : prev.base_code,
      };
    });
  };

  const persist = async (statusOverride?: MaintenanceStatus): Promise<boolean> => {
    let items = itemsList;
    const pending = itemsInput.trim().toUpperCase();
    if (pending) {
      items = [...items, pending];
      setItemsInput("");
      setOrder((p) => ({ ...p, items_replaced: items.join(", ") }));
    }
    const next: Order = { ...order, items_replaced: items.join(", "), status: statusOverride ?? order.status };

    if (isNew) {
      if (!next.vehicle_id) { toast.error("Selecione o veículo."); return false; }
      if (!next.failure_description?.trim()) { toast.error("Descreva o problema relatado."); return false; }
    }
    if (REQUIRES_ITEMS(next.status) && items.length === 0) {
      setOpenSections((p) => ({ ...p, solucao: true }));
      setTimeout(() => itemInputRef.current?.focus(), 60);
      toast.error(`Informe os itens trocados para a OS ficar em "${statusLabel(next.status)}".`, {
        description: "É o que aparece no Financeiro. Se nenhuma peça foi trocada, escreva NENHUM.",
      });
      return false;
    }

    setBusy(true);
    try {
      if (isNew) {
        const { data: num, error: ne } = await supabase.rpc("next_order_number", { _base: next.base_code });
        if (ne) throw new Error(ne.message);
        const payload = { ...toDbPayload(next), order_number: num as string, created_by: user?.id ?? null };
        const { data, error } = await supabase.from("maintenance_orders").insert(payload as never).select("id, order_number").single();
        if (error) throw new Error(error.message);
        if (user?.id) {
          await supabase.from("maintenance_evolutions").insert({ order_id: data.id, user_id: user.id, status: next.status, observation: "OS aberta." });
        }
        toast.success(`OS ${data.order_number} aberta`);
        nav({ to: "/admin/maintenance/$id", params: { id: data.id }, replace: true });
        return true;
      }

      const { error } = await supabase.from("maintenance_orders").update(toDbPayload(next) as never).eq("id", id);
      if (error) throw new Error(error.message);
      const changed = next.status !== savedStatus;
      if (changed && user?.id) {
        await supabase.from("maintenance_evolutions").insert({
          order_id: id, user_id: user.id, status: next.status,
          observation: `Status alterado de "${statusLabel(savedStatus)}" para "${statusLabel(next.status)}".`,
        });
      }
      if (changed && next.status === "aguardando_aprovacao") {
        supabase.functions.invoke("notify-master", { body: { order_id: id, order_number: orderNumber ?? next.order_number } })
          .catch(() => toast.warning("OS enviada, mas a notificação ao Master falhou. Avise-o manualmente."));
      }
      setOrder(next);
      setSavedStatus(next.status);
      setManualStatus(next.status);
      setSnapshot(JSON.stringify(next));
      if (changed) loadEvolutions();
      toast.success(changed ? `Status: ${statusLabel(next.status)}` : "Alterações salvas");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const requestStatus = (next: MaintenanceStatus) => {
    if (next === savedStatus) return;
    if (next === "aguardando_aprovacao") { setBudgetPrompt(true); return; }
    void persist(next);
  };

  const uploadFile = async (file: File, category: UploadCategory): Promise<boolean> => {
    if (isNew) { toast.error("Salve a OS antes de anexar arquivos."); return false; }
    if (file.size > MAX_FILE_SIZE) { toast.error("Arquivo maior que 20 MB."); return false; }
    setUploading(category);
    try {
      const dot = file.name.lastIndexOf(".");
      const ext = (dot > 0 ? file.name.slice(dot + 1) : file.type === "application/pdf" ? "pdf" : "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
      const path = `${id}/${category}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("maintenance-photos").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await (supabase as any)
        .from("maintenance_photos")
        .insert({ order_id: id, category, storage_path: path, uploaded_by: user?.id ?? null })
        .select("id")
        .single();
      if (insErr) {
        await supabase.storage.from("maintenance-photos").remove([path]);
        throw insErr;
      }
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

  const removePhoto = async (p: Photo) => {
    if (!confirm(`Excluir este anexo (${CATEGORY_LABEL[p.category] ?? p.category})?`)) return;
    const { error } = await (supabase as any).from("maintenance_photos").delete().eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    await supabase.storage.from("maintenance-photos").remove([p.storage_path]);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text || !user?.id || isNew) return;
    setNoteBusy(true);
    const { error } = await supabase.from("maintenance_evolutions").insert({ order_id: id, user_id: user.id, status: savedStatus, observation: text });
    setNoteBusy(false);
    if (error) { toast.error(error.message); return; }
    setNote("");
    loadEvolutions();
  };

  const approveOrder = async () => {
    if (!isMaster || isNew || !awaitingApproval) return;
    if (!confirm("Aprovar esta OS e liberar para execução?")) return;
    setApprovalBusy(true);
    try {
      const result = await approveMaintenanceOrder({ data: { order_id: id } });
      const next: Order = { ...order, status: "aprovada", approved_at: result.approved_at, approved_by: user?.id ?? null, denial_reason: null };
      setOrder(next); setSavedStatus("aprovada"); setManualStatus("aprovada"); setSnapshot(JSON.stringify(next));
      toast.success("OS aprovada");
      loadEvolutions();
    } catch (e) { toast.error((e as Error).message); }
    finally { setApprovalBusy(false); }
  };

  const confirmDeny = async (reason: string) => {
    if (!isMaster || isNew || !awaitingApproval) return;
    setApprovalBusy(true);
    try {
      await denyMaintenanceOrder({ data: { order_id: id, reason } });
      const next: Order = { ...order, status: "negada", denial_reason: reason };
      setOrder(next); setSavedStatus("negada"); setManualStatus("negada"); setSnapshot(JSON.stringify(next));
      setShowDenyModal(false);
      toast.success("OS negada");
      loadEvolutions();
    } catch (e) { toast.error((e as Error).message); }
    finally { setApprovalBusy(false); }
  };

  const confirmDelete = async (reason: string) => {
    setDeleteBusy(true);
    try {
      await softDeleteMaintenanceOrder({ data: { order_id: id, reason: reason.trim() } });
      toast.success("OS movida para a lixeira");
      nav({ to: "/admin/maintenance" });
    } catch (e) {
      toast.error((e as Error).message);
      setDeleteBusy(false);
    }
  };

  const exportPdf = async () => {
    const doc = new jsPDF();
    const veh = vehicles.find((v) => v.id === order.vehicle_id);
    const drv = drivers.find((d) => d.id === order.driver_id) ?? extraDriver;
    const fullTitle = order.order_type === "SMI" ? "SOLICITAÇÃO DE MANUTENÇÃO INTERNA" : "SOLICITAÇÃO DE MANUTENÇÃO VEICULAR";
    await applyPdfBranding(doc, `${order.order_type} — ${fullTitle}`, `Nº ${orderNumber ?? "(nova)"} • Status: ${statusLabel(savedStatus)}`);
    doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.text("TIPO DE MANUTENÇÃO:", 14, 36); doc.setFont("helvetica", "normal");
    const cats = ["corretiva", "preventiva", "planejada"] as const;
    cats.forEach((c, i) => { const x = 60 + i * 45; doc.rect(x, 32, 4, 4); if (order.maintenance_category === c) { doc.setFillColor(0, 0, 0); doc.rect(x + 0.5, 32.5, 3, 3, "F"); } doc.text(c.toUpperCase(), x + 6, 35.5); });
    autoTable(doc, {
      startY: 42, head: [["DADOS", "", "DADOS", ""]],
      body: [
        ["Placa", veh?.plate ?? "—", "Nº OS", orderNumber ?? "—"],
        ["Modelo do carro", order.mod_carro || veh?.model || "—", "Validade do óleo", order.validade_oleo || "—"],
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
    section("DESCRIÇÃO DO PROBLEMA", order.failure_description ?? "", 36); section("DESCRIÇÃO DA SOLUÇÃO", order.solution_description ?? "", 36); section("ITENS TROCADOS", order.items_replaced ?? "", 20);
    if (order.observations) section("OBSERVAÇÕES", order.observations, 16);
    y += 10; doc.setFontSize(9); doc.line(20, y, 90, y); doc.text("Assinatura do mecânico", 30, y + 5); doc.line(120, y, 190, y); doc.text("Assinatura do responsável", 130, y + 5); doc.text(`Data: ____ / ____ / ________`, 20, y + 15);
    doc.save(`${order.order_type}_${orderNumber ?? "nova"}.pdf`);
  };

  // ---------- dados derivados para a interface ----------
  const veh = vehicles.find((v) => v.id === order.vehicle_id);
  const vehicleOptions: SearchOption[] = vehicles
    .filter((v) => v.active !== false || v.id === order.vehicle_id)
    .map((v) => ({ value: v.id, label: v.plate, hint: [v.model, v.active === false ? "inativo" : null].filter(Boolean).join(" · ") || null }));
  const driverOptions: SearchOption[] = [
    ...drivers,
    ...(extraDriver && !drivers.some((d) => d.id === extraDriver.id) ? [extraDriver] : []),
  ].map((d) => ({ value: d.id, label: d.full_name ?? d.id.slice(0, 8) }));
  const baseKnown = BASE_CODES.some((b) => b.code === order.base_code);

  const allNext = NEXT_STEPS[savedStatus] ?? [];
  const allowedNext = allNext.filter((s) => isMaster || !isFinal(s));
  const finalNeedsMaster = allowedNext.length < allNext.length;
  const manualOptions = STATUS_OPTIONS.filter((o) =>
    o.value === savedStatus ||
    (!LEGACY_STATUSES.includes(o.value) && (isMaster || (!isFinal(o.value) && o.value !== "aprovada"))),
  );
  // Reabrir uma OS concluída (já visível no Financeiro) fica com o Master, que é quem finaliza
  const canChangeManually = !locked && manualOptions.length > 1 && (isMaster || !IS_DONE_STATUS(savedStatus));

  const laborTotal = (order.labor_cost ?? 0) + (order.parts_cost ?? 0);
  const subtitle = isNew
    ? "Preencha o essencial agora — o restante pode ser completado depois."
    : [veh?.plate, order.mod_carro || veh?.model, order.created_at && `aberta ${timeAgo(order.created_at)}`].filter(Boolean).join(" · ");
  const saveLabel = busy ? "Salvando…" : isNew ? "Abrir OS" : "Salvar";

  const statusCard = (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold flex items-center gap-2"><Wrench className="size-4 text-primary" />Andamento</h2>
        <StatusBadge status={savedStatus} />
      </div>
      <StageStepper status={savedStatus} />

      {inTrash ? (
        <p className="text-xs text-muted-foreground">OS na lixeira — restaure-a pela Lixeira para voltar a editar.</p>
      ) : awaitingApproval ? (
        isMaster ? (
          <div className="grid grid-cols-2 gap-2">
            <Button className="bg-green-600 text-white hover:bg-green-700" onClick={approveOrder} disabled={approvalBusy}>
              <CheckCircle2 />{approvalBusy ? "Aprovando…" : "Aprovar"}
            </Button>
            <Button variant="destructive" onClick={() => setShowDenyModal(true)} disabled={approvalBusy}><Ban />Negar</Button>
          </div>
        ) : (
          <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2.5 text-xs text-yellow-800 dark:text-yellow-300">
            Aguardando decisão de um usuário Master. A OS fica bloqueada até lá.
          </p>
        )
      ) : allowedNext.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Próximo passo</div>
          {allowedNext.map((s) => {
            const primary = s === allNext[0];
            return (
              <Button
                key={s}
                variant={primary ? "default" : "outline"}
                className={cn("w-full justify-between", s === "finalizada" && "bg-green-600 text-white hover:bg-green-700 border-transparent")}
                onClick={() => requestStatus(s)}
                disabled={busy}
              >
                {actionLabel(savedStatus, s)}<ArrowRight />
              </Button>
            );
          })}
          {finalNeedsMaster && <p className="text-[11px] text-muted-foreground">A finalização é feita por um usuário Master.</p>}
        </div>
      ) : closed ? (
        <p className="text-xs text-muted-foreground">
          {savedStatus === "cancelada" ? "OS cancelada." : savedStatus === "negada" ? "OS negada." : "OS concluída."}
          {canChangeManually ? " Se precisar reabrir, use a alteração manual abaixo." : ""}
        </p>
      ) : null}

      {canChangeManually && (
        <details className="group rounded-md border border-border">
          <summary className="cursor-pointer select-none list-none px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
            Alterar status manualmente
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="flex gap-2 p-3 pt-1">
            <select
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as MaintenanceStatus)}
              className="h-9 flex-1 min-w-0 rounded-md border border-border bg-input px-2 text-sm"
              aria-label="Novo status"
            >
              {manualOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button size="sm" className="h-9" disabled={busy || manualStatus === savedStatus} onClick={() => requestStatus(manualStatus)}>Aplicar</Button>
          </div>
        </details>
      )}
    </Card>
  );

  const canDeletePhotos = !locked && !closed;
  const attachmentsCard = (
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <Paperclip className="size-4 text-primary" />Anexos <span className="font-normal text-muted-foreground">({photos.length})</span>
      </h2>
      <div className="grid grid-cols-2 gap-2">
        {UPLOAD_CATEGORIES.map((c) => {
          const disabled = inTrash || uploading !== null;
          return (
            <label
              key={c.key}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "justify-start cursor-pointer", disabled && "pointer-events-none opacity-50")}
            >
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                disabled={disabled}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadFile(f, c.key); }}
              />
              {uploading === c.key ? <Clock className="animate-pulse" /> : <Plus />}
              <span className="truncate">{uploading === c.key ? "Enviando…" : c.label}</span>
            </label>
          );
        })}
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum anexo ainda. Envie fotos ou PDFs (até 20 MB) pelos botões acima.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => {
            const isPdf = p.storage_path.toLowerCase().endsWith(".pdf");
            const label = p.source === "checklist" ? `Checklist: ${p.category}` : CATEGORY_LABEL[p.category] ?? p.category;
            return (
              <div key={`${p.source}-${p.id}`} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted/40">
                <a href={p.url} target="_blank" rel="noreferrer" title={label} className="grid h-full w-full place-items-center">
                  {isPdf
                    ? <span className="flex flex-col items-center gap-1 text-primary"><FileText className="size-6" /><span className="text-[10px] font-semibold">PDF</span></span>
                    : <img src={p.url} alt={label} className="h-full w-full object-cover" loading="lazy" />}
                </a>
                <span className={cn(
                  "pointer-events-none absolute inset-x-0 bottom-0 truncate px-1.5 py-0.5 text-[10px] font-semibold text-white",
                  p.category === "orcamento" ? "bg-primary/90" : p.source === "checklist" ? "bg-amber-600/90" : "bg-black/60",
                )}>
                  {label}
                </span>
                {p.source === "os" && canDeletePhotos && (
                  <button
                    type="button"
                    aria-label={`Excluir anexo ${label}`}
                    onClick={() => removePhoto(p)}
                    className="absolute right-1 top-1 rounded bg-black/60 p-1 text-white transition-opacity hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
                  >
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
    <Card className="p-4 space-y-3">
      <h2 className="text-sm font-semibold flex items-center gap-2"><History className="size-4 text-primary" />Histórico</h2>
      {!inTrash && (
        <div className="space-y-2">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Registrar uma atualização (ex.: peça pedida ao fornecedor)" />
          <Button size="sm" variant="secondary" className="w-full" disabled={!note.trim() || noteBusy} onClick={addNote}>
            {noteBusy ? "Registrando…" : "Registrar atualização"}
          </Button>
        </div>
      )}
      {evolutions.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum registro ainda. Mudanças de status entram aqui automaticamente.</p>
      ) : (
        <ol className="relative ml-1.5 max-h-[28rem] space-y-4 overflow-auto border-l border-border pr-1">
          {evolutions.map((e) => (
            <li key={e.id} className="ml-4">
              <span aria-hidden className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full bg-primary/70 ring-2 ring-card" />
              <div className="flex flex-wrap items-center gap-2">
                {e.status && <StatusBadge status={e.status} />}
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

  return (
    <div className={cn("mx-auto space-y-4 pb-24 md:pb-6", isNew ? "max-w-3xl" : "max-w-6xl")}>
      {/* Cabeçalho */}
      <div className="flex items-start gap-2">
        <Button asChild variant="ghost" size="icon" className="-ml-2 shrink-0">
          <Link to="/admin/maintenance" aria-label="Voltar para a lista"><ArrowLeft /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-bold md:text-2xl">{isNew ? "Nova ordem de serviço" : `OS ${orderNumber ?? ""}`}</h1>
            {!isNew && loaded && <><TypeBadge type={order.order_type} /><StatusBadge status={savedStatus} /></>}
          </div>
          <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {!isNew && <Button variant="outline" onClick={exportPdf} disabled={!loaded}><FileDown />PDF</Button>}
          <Button onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button>
        </div>
        {!isNew && isAdmin && !inTrash && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0" aria-label="Mais ações"><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setShowDeleteModal(true)} className="text-destructive focus:text-destructive">
                <Trash2 />Mover para a lixeira
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Avisos */}
      {existingOs && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
          <AlertTriangle className="size-4 shrink-0 text-blue-600" />
          <span className="flex-1">Este checklist já tem a OS <strong>{existingOs.order_number}</strong>.</span>
          <Button asChild size="sm" variant="outline" className="bg-background">
            <Link to="/admin/maintenance/$id" params={{ id: existingOs.id }}>Abrir OS existente</Link>
          </Button>
        </div>
      )}
      {inTrash && (
        <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <Trash2 className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>Esta OS está na <strong>lixeira</strong> e não pode ser editada.</span>
        </div>
      )}
      {!inTrash && awaitingApproval && (
        <div className="flex gap-2 rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm">
          <Clock className="mt-0.5 size-4 shrink-0 text-yellow-600" />
          <span>
            <strong>Aguardando aprovação do Master.</strong>{" "}
            {isMaster ? "Revise o orçamento e os anexos e decida em Andamento." : "Os campos ficam bloqueados até a decisão."}
          </span>
        </div>
      )}
      {savedStatus === "negada" && order.denial_reason && (
        <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm">
          <Ban className="mt-0.5 size-4 shrink-0 text-rose-600" />
          <span><strong>OS negada.</strong> Motivo: <span className="whitespace-pre-line">{order.denial_reason}</span></span>
        </div>
      )}

      {!loaded ? <FormSkeleton /> : (
        <div className={cn("grid grid-cols-1 gap-4", !isNew && "lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr] lg:items-start")}>
          {!isNew && <div className="lg:col-start-2 lg:row-start-1">{statusCard}</div>}

          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Section icon={Truck} title="Veículo e responsável" hint="Placa, motorista e tipo da OS" locked={locked}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Veículo" required={isNew} className="sm:col-span-2">
                  <SearchSelect
                    value={order.vehicle_id}
                    onChange={onVehicleChange}
                    options={vehicleOptions}
                    placeholder="Buscar placa ou modelo…"
                    searchPlaceholder="Digite a placa ou o modelo"
                    emptyText="Nenhum veículo encontrado."
                    disabled={locked}
                  />
                </Field>
                <Field label="Tipo de OS">
                  <ChoiceGroup value={order.order_type} onChange={(v) => set("order_type", v)} options={[["SMI", "SMI · Interna"], ["SMV", "SMV · Externa"]]} label="Tipo de OS" />
                </Field>
                <Field label="Categoria">
                  <ChoiceGroup
                    value={(order.maintenance_category ?? "corretiva") as "corretiva" | "preventiva" | "planejada"}
                    onChange={(v) => set("maintenance_category", v)}
                    options={[["corretiva", "Corretiva"], ["preventiva", "Preventiva"], ["planejada", "Planejada"]]}
                    label="Categoria da manutenção"
                  />
                </Field>
                <Field label="Motorista">
                  <SearchSelect
                    value={order.driver_id}
                    onChange={(v) => set("driver_id", v)}
                    options={driverOptions}
                    placeholder="Buscar motorista…"
                    searchPlaceholder="Digite o nome"
                    emptyText="Nenhum motorista encontrado."
                    disabled={locked}
                  />
                </Field>
                <Field label="Base" hint={isNew ? "Preenchida pelo veículo; faz parte do nº da OS" : "Definida na abertura da OS"}>
                  <select
                    value={order.base_code}
                    onChange={(e) => set("base_code", e.target.value)}
                    disabled={!isNew}
                    className="h-10 w-full rounded-md border border-border bg-input px-3 text-sm disabled:opacity-70"
                  >
                    {!baseKnown && <option value={order.base_code}>{order.base_code}</option>}
                    {BASE_CODES.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.label}</option>)}
                  </select>
                </Field>
                <Field label="Modelo do veículo">
                  <Input value={order.mod_carro ?? ""} onChange={(e) => set("mod_carro", e.target.value)} placeholder={veh?.model ?? ""} />
                </Field>
                <Field label="KM atual">
                  <Input type="number" inputMode="numeric" min={0} value={order.km_atual ?? ""} onChange={(e) => set("km_atual", numOrNull(e.target.value))} />
                </Field>
              </div>
            </Section>

            <Section icon={AlertTriangle} title="Problema relatado" hint="O que precisa ser resolvido" locked={locked}>
              <Field label="Descrição do problema" required={isNew}>
                <Textarea
                  rows={4}
                  value={order.failure_description ?? ""}
                  onChange={(e) => set("failure_description", e.target.value)}
                  placeholder="O que foi observado? Ex.: barulho no freio dianteiro ao frear"
                />
              </Field>
              {order.checklist_id && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ClipboardCheck className="size-3.5" />Vinculada ao checklist do motorista — as fotos das falhas aparecem em Anexos.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de serviço">
                  <Input list="os-service-suggestions" value={order.service_type ?? ""} onChange={(e) => set("service_type", e.target.value)} placeholder="Ex.: Freios" />
                  <datalist id="os-service-suggestions">{suggestions.services.map((s) => <option key={s} value={s} />)}</datalist>
                </Field>
                <Field label={order.order_type === "SMV" ? "Oficina externa" : "Oficina / responsável"}>
                  <Input list="os-workshop-suggestions" value={order.workshop ?? ""} onChange={(e) => set("workshop", e.target.value)} placeholder="Ex.: Oficina interna" />
                  <datalist id="os-workshop-suggestions">{suggestions.workshops.map((s) => <option key={s} value={s} />)}</datalist>
                </Field>
              </div>
              <Field label="Observações gerais">
                <Textarea rows={2} value={order.observations ?? ""} onChange={(e) => set("observations", e.target.value)} />
              </Field>
            </Section>

            <Section
              icon={LogIn}
              title="Entrada e saída na oficina"
              hint="Datas, combustível e validade do óleo"
              open={openSections.entrada}
              onToggle={() => toggleSection("entrada")}
              locked={locked}
              filled={[countFilled(order.data_entrada, order.data_saida, order.combustivel_chegada, order.validade_oleo), 4]}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <DateTimeField label="Entrada" date={order.data_entrada} time={order.hora_entrada} onChange={(d, t) => setOrder((p) => ({ ...p, data_entrada: d, hora_entrada: t }))} />
                <DateTimeField label="Saída" date={order.data_saida} time={order.hora_saida} onChange={(d, t) => setOrder((p) => ({ ...p, data_saida: d, hora_saida: t }))} />
                <Field label="Combustível na chegada">
                  <div className="flex flex-wrap gap-1.5">
                    {[...FUEL_LEVELS, ...(order.combustivel_chegada && !FUEL_LEVELS.includes(order.combustivel_chegada) ? [order.combustivel_chegada] : [])].map((l) => {
                      const on = order.combustivel_chegada === l;
                      return (
                        <button
                          key={l}
                          type="button"
                          aria-pressed={on}
                          onClick={() => set("combustivel_chegada", on ? "" : l)}
                          className={cn(
                            "h-9 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                            on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-muted",
                          )}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Validade do óleo">
                  <Input value={order.validade_oleo ?? ""} onChange={(e) => set("validade_oleo", e.target.value)} placeholder="KM ou data" />
                </Field>
              </div>
            </Section>

            <Section
              icon={Calculator}
              title="Orçamento"
              hint={laborTotal > 0 ? `Total estimado: ${brl(laborTotal)}` : "Mão de obra e peças — visível ao Master na aprovação"}
              open={openSections.orcamento}
              onToggle={() => toggleSection("orcamento")}
              locked={locked}
              filled={[countFilled(order.labor_description, order.labor_cost, order.parts_needed, order.parts_cost), 4]}
            >
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="text-sm font-semibold">Mão de obra</div>
                  <Field label="Descrição">
                    <Textarea rows={2} value={order.labor_description ?? ""} onChange={(e) => set("labor_description", e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Horas previstas">
                      <Input type="number" inputMode="decimal" min={0} step="0.5" value={order.labor_hours ?? ""} onChange={(e) => set("labor_hours", numOrNull(e.target.value))} />
                    </Field>
                    <Field label="Valor (R$)">
                      <Input type="number" inputMode="decimal" min={0} step="0.01" value={order.labor_cost ?? ""} onChange={(e) => set("labor_cost", numOrNull(e.target.value))} />
                    </Field>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="text-sm font-semibold">Peças</div>
                  <Field label="Peças necessárias / quantidade">
                    <Textarea rows={2} value={order.parts_needed ?? ""} onChange={(e) => set("parts_needed", e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Fornecedor">
                      <Input value={order.parts_supplier ?? ""} onChange={(e) => set("parts_supplier", e.target.value)} />
                    </Field>
                    <Field label="Valor (R$)">
                      <Input type="number" inputMode="decimal" min={0} step="0.01" value={order.parts_cost ?? ""} onChange={(e) => set("parts_cost", numOrNull(e.target.value))} />
                    </Field>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span className="text-muted-foreground">Total estimado</span>
                <strong>{brl(laborTotal)}</strong>
              </div>
            </Section>

            <Section
              icon={CheckCircle2}
              title="Solução e conclusão"
              hint="O que foi feito e as peças trocadas"
              open={openSections.solucao}
              onToggle={() => toggleSection("solucao")}
              locked={locked}
              filled={[countFilled(order.solution_description, order.items_replaced, order.final_observation), 3]}
            >
              <Field label="Descrição da solução">
                <Textarea rows={3} value={order.solution_description ?? ""} onChange={(e) => set("solution_description", e.target.value)} />
              </Field>
              <Field
                label="Itens trocados"
                required={REQUIRES_ITEMS(savedStatus)}
                hint="Obrigatório a partir da aprovação — é o que aparece no Financeiro. Tecle Enter ou vírgula para separar."
              >
                <ItemsInput
                  items={itemsList}
                  input={itemsInput}
                  onInput={setItemsInput}
                  onAdd={addItem}
                  onRemove={(i) => updateItems(itemsList.filter((_, idx) => idx !== i))}
                  inputRef={itemInputRef}
                />
              </Field>
              <Field label="Observação final">
                <Textarea rows={2} value={order.final_observation ?? ""} onChange={(e) => set("final_observation", e.target.value)} placeholder="Recomendações, garantia, próxima revisão…" />
              </Field>
            </Section>

            {isNew && (
              <div className="hidden justify-end md:flex">
                <Button size="lg" onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button>
              </div>
            )}
          </div>

          {!isNew && <div className="space-y-4 lg:col-start-2 lg:row-start-2">{attachmentsCard}{historyCard}</div>}
        </div>
      )}

      {/* Desktop: barra contextual só quando há edição pendente */}
      {dirty && !locked && (
        <div role="status" className="fixed bottom-6 right-6 z-30 hidden items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg md:flex">
          <span className="size-2 rounded-full bg-amber-400" aria-hidden />
          <span className="text-sm font-medium">Alterações não salvas</span>
          <Button variant="ghost" size="sm" onClick={discardChanges} disabled={busy}>Descartar</Button>
          <Button size="sm" onClick={() => void persist()} disabled={saveDisabled}><Save />{saveLabel}</Button>
        </div>
      )}

      {/* Barra fixa no celular: ação principal sempre ao alcance do polegar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-border bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        {!isNew && (
          <Button variant="outline" size="icon" className="size-11 shrink-0" onClick={exportPdf} disabled={!loaded} aria-label="Baixar PDF">
            <FileDown />
          </Button>
        )}
        <Button className="h-11 flex-1" onClick={() => void persist()} disabled={saveDisabled}>
          <Save />{saveLabel}{dirty && !busy && <span className="ml-1 size-2 rounded-full bg-amber-400" aria-label="Alterações não salvas" />}
        </Button>
      </div>

      {showDenyModal && <DenyModal busy={approvalBusy} onClose={() => setShowDenyModal(false)} onConfirm={confirmDeny} />}

      {budgetPrompt && (
        <BudgetPromptModal
          busy={uploading === "orcamento" || busy}
          onCancel={() => setBudgetPrompt(false)}
          onSkip={() => { setBudgetPrompt(false); void persist("aguardando_aprovacao"); }}
          onSend={async (file) => {
            const ok = await uploadFile(file, "orcamento");
            if (!ok) return;
            setBudgetPrompt(false);
            await persist("aguardando_aprovacao");
          }}
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
