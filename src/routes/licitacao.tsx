import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ERPSidebar } from "@/components/erp-sidebar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Gavel, Plus, Loader2, AlertTriangle, Clock, ChevronRight,
  X, Edit2, Trash2, ShieldAlert,
} from "lucide-react";

export const Route = createFileRoute("/licitacao")({ component: LicitacaoPage });

// ── Tipos ────────────────────────────────────────────────────────────────────
type LicitacaoStatus =
  | "mapeada" | "em_analise" | "proposta_enviada"
  | "aguardando_resultado" | "ganha" | "perdida";

type LicitacaoModalidade =
  | "pregao_eletronico" | "pregao_presencial" | "concorrencia"
  | "tomada_de_precos" | "convite" | "dispensa" | "inexigibilidade";

type Licitacao = {
  id: string;
  titulo: string;
  numero_processo: string | null;
  orgao_licitante: string | null;
  valor_estimado: number | null;
  modalidade: LicitacaoModalidade | null;
  responsavel_id: string | null;
  status: LicitacaoStatus;
  data_abertura: string | null;
  data_vencimento: string | null;
  observacoes: string | null;
  created_at: string;
};

type UserOption = { id: string; email: string; full_name: string | null };

// ── Constantes ───────────────────────────────────────────────────────────────
const COLUMNS: { key: LicitacaoStatus; label: string; color: string; bg: string }[] = [
  { key: "mapeada",             label: "Mapeada",              color: "text-slate-600",   bg: "bg-slate-100 dark:bg-slate-800" },
  { key: "em_analise",          label: "Em Análise",           color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-950" },
  { key: "proposta_enviada",    label: "Proposta Enviada",     color: "text-violet-600",  bg: "bg-violet-50 dark:bg-violet-950" },
  { key: "aguardando_resultado",label: "Aguardando Resultado", color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-950" },
  { key: "ganha",               label: "Ganha",                color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
  { key: "perdida",             label: "Perdida",              color: "text-rose-600",    bg: "bg-rose-50 dark:bg-rose-950" },
];

const MODALIDADES: { value: LicitacaoModalidade; label: string }[] = [
  { value: "pregao_eletronico",  label: "Pregão Eletrônico" },
  { value: "pregao_presencial",  label: "Pregão Presencial" },
  { value: "concorrencia",       label: "Concorrência" },
  { value: "tomada_de_precos",   label: "Tomada de Preços" },
  { value: "convite",            label: "Convite" },
  { value: "dispensa",           label: "Dispensa" },
  { value: "inexigibilidade",    label: "Inexigibilidade" },
];

const STATUS_NEXT: Partial<Record<LicitacaoStatus, LicitacaoStatus>> = {
  mapeada:              "em_analise",
  em_analise:           "proposta_enviada",
  proposta_enviada:     "aguardando_resultado",
  aguardando_resultado: "ganha",
};

const DEVICE_TOKEN_KEY = "licitacao_device_token";

function getOrCreateDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem(DEVICE_TOKEN_KEY, token);
  }
  return token;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const d = new Date(date + "T00:00:00");
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - t.getTime()) / 86400000);
}

function formatCurrency(v: number | null) {
  if (v == null) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(d: string | null) {
  if (!d) return null;
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// ── Página principal ─────────────────────────────────────────────────────────
function LicitacaoPage() {
  const { user, isAdmin, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">Carregando…</div>;
  if (!user) return <Navigate to="/" />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <ERPSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-12 flex items-center border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10 px-2 gap-2">
            <SidebarTrigger />
            <Gavel className="size-4 text-primary" />
            <span className="text-sm font-semibold">Licitações</span>
          </header>
          <main className="flex-1 overflow-hidden">
            <LicitacaoBoard userId={user.id} isAdmin={isAdmin} />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

// ── Auth gate (device token) ─────────────────────────────────────────────────
type AuthState = "checking" | "authorized" | "pending" | "denied";

function LicitacaoBoard({ userId, isAdmin }: { userId: string; isAdmin: boolean }) {
  const [authState, setAuthState] = useState<AuthState>("checking");

  useEffect(() => {
    const token = getOrCreateDeviceToken();
    const deviceLabel = `${navigator.platform} — ${new Date().toLocaleDateString("pt-BR")}`;

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setAuthState("denied"); return; }

      const { data, error } = await supabase.functions.invoke("licitacao-auth", {
        body: { device_token: token, device_label: deviceLabel },
      });

      if (error || !data?.authorized) {
        const reason = data?.reason ?? "denied";
        setAuthState(reason === "pending_approval" ? "pending" : "denied");
      } else {
        setAuthState("authorized");
      }
    })();
  }, [userId]);

  if (authState === "checking") {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> A verificar autorização…
      </div>
    );
  }

  if (authState === "pending") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <Clock className="size-12 text-amber-500 opacity-70" />
        <div>
          <p className="font-semibold text-base">Dispositivo pendente de aprovação</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            O teu dispositivo foi registado e aguarda aprovação por um administrador.
            Após a aprovação, poderás aceder a este módulo.
          </p>
        </div>
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
        <ShieldAlert className="size-12 text-rose-500 opacity-70" />
        <div>
          <p className="font-semibold text-base">Acesso não autorizado</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
            Não tens permissão para aceder ao módulo de Licitações.
            Contacta o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  return <KanbanBoard isAdmin={isAdmin} />;
}

// ── Kanban ───────────────────────────────────────────────────────────────────
function KanbanBoard({ isAdmin }: { isAdmin: boolean }) {
  const [items, setItems] = useState<Licitacao[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Licitacao | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const [lRes, uRes] = await Promise.all([
      supabase.from("licitacoes" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles" as any).select("user_id, users:auth.users(email, raw_user_meta_data)"),
    ]);
    setItems((lRes.data ?? []) as any[]);
    setLoading(false);

    // Simplificado: buscar lista de utilizadores para responsável
    const { data: profiles } = await supabase.from("user_profiles" as any).select("id, full_name, email").order("full_name");
    if (profiles) setUsers(profiles as any[]);
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" /> Carregando licitações…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <p className="text-sm text-muted-foreground">{items.length} licitação{items.length !== 1 ? "ões" : ""}</p>
        <Button size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> Nova Licitação
        </Button>
      </div>

      {/* Colunas Kanban */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-3 p-4 h-full min-w-max">
          {COLUMNS.map((col) => {
            const cards = items.filter((i) => i.status === col.key);
            return (
              <div key={col.key} className="flex flex-col w-72 shrink-0">
                <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${col.bg}`}>
                  <span className={`text-xs font-bold uppercase tracking-wide ${col.color}`}>{col.label}</span>
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full bg-background/60 ${col.color}`}>{cards.length}</span>
                </div>
                <div className={`flex-1 overflow-y-auto rounded-b-lg p-2 space-y-2 min-h-[120px] ${col.bg} bg-opacity-40`}>
                  {cards.map((item) => (
                    <LicitacaoCard
                      key={item.id}
                      item={item}
                      users={users}
                      onOpen={() => setSelected(item)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal detalhe */}
      {selected && (
        <LicitacaoDetail
          item={selected}
          users={users}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onSaved={(updated) => {
            setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i));
            setSelected(updated);
          }}
          onDeleted={() => {
            setItems((prev) => prev.filter((i) => i.id !== selected.id));
            setSelected(null);
          }}
        />
      )}

      {/* Modal nova licitação */}
      {creating && (
        <LicitacaoForm
          users={users}
          onClose={() => setCreating(false)}
          onSaved={(novo) => {
            setItems((prev) => [novo, ...prev]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

// ── Card Kanban ──────────────────────────────────────────────────────────────
function LicitacaoCard({ item, users, onOpen }: {
  item: Licitacao; users: UserOption[]; onOpen: () => void;
}) {
  const days = item.status === "ganha" ? daysUntil(item.data_vencimento) : null;
  const responsible = users.find((u) => u.id === item.responsavel_id);
  const modalLabel = MODALIDADES.find((m) => m.value === item.modalidade)?.label;

  const expiryBadge = days !== null
    ? days < 0
      ? { label: "Vencido", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" }
      : days <= 30
        ? { label: `Vence em ${days}d`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" }
        : { label: `${days}d restantes`, cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
    : null;

  return (
    <div
      className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all space-y-2"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight line-clamp-2">{item.titulo}</p>
        <ChevronRight className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
      </div>

      {item.orgao_licitante && (
        <p className="text-xs text-muted-foreground line-clamp-1">{item.orgao_licitante}</p>
      )}

      <div className="flex flex-wrap gap-1">
        {modalLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">{modalLabel}</span>
        )}
        {expiryBadge && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${expiryBadge.cls}`}>
            {days !== null && days <= 30 && <AlertTriangle className="size-2.5" />}
            {expiryBadge.label}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        {item.valor_estimado != null && <span>{formatCurrency(item.valor_estimado)}</span>}
        {responsible && <span className="truncate max-w-[100px]">{responsible.full_name ?? responsible.email}</span>}
      </div>
    </div>
  );
}

// ── Modal detalhe / edição ───────────────────────────────────────────────────
function LicitacaoDetail({ item, users, isAdmin, onClose, onSaved, onDeleted }: {
  item: Licitacao; users: UserOption[]; isAdmin: boolean;
  onClose: () => void; onSaved: (l: Licitacao) => void; onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ...item });

  const nextStatus = STATUS_NEXT[item.status];
  const col = COLUMNS.find((c) => c.key === item.status)!;

  const save = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("licitacoes" as any)
      .update({
        titulo: form.titulo,
        numero_processo: form.numero_processo || null,
        orgao_licitante: form.orgao_licitante || null,
        valor_estimado: form.valor_estimado ?? null,
        modalidade: form.modalidade || null,
        responsavel_id: form.responsavel_id || null,
        data_abertura: form.data_abertura || null,
        data_vencimento: form.data_vencimento || null,
        observacoes: form.observacoes || null,
        status: form.status,
      })
      .eq("id", item.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) { toast.error("Erro ao guardar"); return; }
    toast.success("Licitação atualizada");
    setEditing(false);
    onSaved(data as any);
  };

  const moveStatus = async (status: LicitacaoStatus) => {
    setBusy(true);
    const { data, error } = await supabase
      .from("licitacoes" as any)
      .update({ status })
      .eq("id", item.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) { toast.error("Erro ao mover"); return; }
    onSaved(data as any);
  };

  const del = async () => {
    if (!confirm("Eliminar esta licitação?")) return;
    setBusy(true);
    const { error } = await supabase.from("licitacoes" as any).delete().eq("id", item.id);
    setBusy(false);
    if (error) { toast.error("Erro ao eliminar"); return; }
    toast.success("Licitação eliminada");
    onDeleted();
  };

  const days = item.status === "ganha" ? daysUntil(item.data_vencimento) : null;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2 pr-6">
            <div>
              <DialogTitle className="text-lg leading-tight">{item.titulo}</DialogTitle>
              <span className={`mt-1 inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${col.bg} ${col.color}`}>
                {col.label}
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Alerta de vencimento */}
        {days !== null && days <= 30 && (
          <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${days < 0 ? "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
            <AlertTriangle className="size-4 shrink-0" />
            {days < 0 ? `Contrato vencido há ${Math.abs(days)} dia(s)` : `Contrato vence em ${days} dia(s) — ${formatDate(item.data_vencimento)}`}
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Título *</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nº Processo</Label>
                <Input value={form.numero_processo ?? ""} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Órgão Licitante</Label>
                <Input value={form.orgao_licitante ?? ""} onChange={(e) => setForm({ ...form, orgao_licitante: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor Estimado (R$)</Label>
                <Input type="number" step="0.01" value={form.valor_estimado ?? ""} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value ? Number(e.target.value) : null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Modalidade</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.modalidade ?? ""} onChange={(e) => setForm({ ...form, modalidade: e.target.value as LicitacaoModalidade || null })}>
                  <option value="">— selecionar —</option>
                  {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável Interno</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.responsavel_id ?? ""} onChange={(e) => setForm({ ...form, responsavel_id: e.target.value || null })}>
                  <option value="">— nenhum —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Data de Abertura</Label>
                <Input type="date" value={form.data_abertura ?? ""} onChange={(e) => setForm({ ...form, data_abertura: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Vencimento do Contrato</Label>
                <Input type="date" value={form.data_vencimento ?? ""} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value || null })} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LicitacaoStatus })}>
                  {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Observações</Label>
                <Textarea rows={3} value={form.observacoes ?? ""} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setEditing(false)} disabled={busy}>Cancelar</Button>
              <Button onClick={save} disabled={busy || !form.titulo.trim()}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : "Guardar"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Detail label="Nº Processo"    value={item.numero_processo} />
              <Detail label="Órgão Licitante" value={item.orgao_licitante} />
              <Detail label="Modalidade"     value={MODALIDADES.find((m) => m.value === item.modalidade)?.label ?? null} />
              <Detail label="Valor Estimado" value={formatCurrency(item.valor_estimado)} />
              <Detail label="Abertura"       value={formatDate(item.data_abertura)} />
              <Detail label="Venc. Contrato" value={formatDate(item.data_vencimento)} />
              <Detail label="Responsável"    value={users.find((u) => u.id === item.responsavel_id)?.full_name ?? users.find((u) => u.id === item.responsavel_id)?.email ?? null} />
              {item.observacoes && (
                <div className="col-span-2 space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{item.observacoes}</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              {nextStatus && (
                <Button size="sm" onClick={() => moveStatus(nextStatus)} disabled={busy}>
                  Mover para: {COLUMNS.find((c) => c.key === nextStatus)?.label}
                </Button>
              )}
              {item.status !== "perdida" && (
                <Button size="sm" variant="outline" onClick={() => moveStatus("perdida")} disabled={busy}>
                  Marcar como Perdida
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
                <Edit2 className="size-3.5" /> Editar
              </Button>
              {isAdmin && (
                <Button size="sm" variant="destructive" className="gap-1.5 ml-auto" onClick={del} disabled={busy}>
                  <Trash2 className="size-3.5" /> Eliminar
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

// ── Modal criar licitação ─────────────────────────────────────────────────────
function LicitacaoForm({ users, onClose, onSaved }: {
  users: UserOption[]; onClose: () => void; onSaved: (l: Licitacao) => void;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    titulo: "", numero_processo: "", orgao_licitante: "", valor_estimado: "",
    modalidade: "" as LicitacaoModalidade | "",
    responsavel_id: "" , data_abertura: "", data_vencimento: "", observacoes: "",
    status: "mapeada" as LicitacaoStatus,
  });

  const validate = (): string | null => {
    if (!form.titulo.trim()) return "Título obrigatório";
    if (form.titulo.length > 300) return "Título demasiado longo (máx. 300 caracteres)";
    if (form.numero_processo.length > 50) return "Nº processo demasiado longo";
    if (form.orgao_licitante.length > 200) return "Órgão licitante demasiado longo";
    if (form.valor_estimado && Number(form.valor_estimado) > 999_999_999) return "Valor estimado inválido";
    if (form.observacoes.length > 2000) return "Observações demasiado longas (máx. 2000)";
    return null;
  };

  const submit = async () => {
    const err = validate();
    if (err) return toast.error(err);
    setBusy(true);
    const { data, error } = await supabase
      .from("licitacoes" as any)
      .insert({
        titulo: form.titulo.trim(),
        numero_processo: form.numero_processo || null,
        orgao_licitante: form.orgao_licitante || null,
        valor_estimado: form.valor_estimado ? Number(form.valor_estimado) : null,
        modalidade: form.modalidade || null,
        responsavel_id: form.responsavel_id || null,
        data_abertura: form.data_abertura || null,
        data_vencimento: form.data_vencimento || null,
        observacoes: form.observacoes || null,
        status: form.status,
        created_by: user?.id ?? null,
      })
      .select("*")
      .single();
    setBusy(false);
    if (error) { toast.error("Erro ao criar licitação"); return; }
    toast.success("Licitação criada");
    onSaved(data as any);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova Licitação</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Título *</Label>
            <Input maxLength={300} placeholder="ex: Aquisição de veículos utilitários" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Nº Processo</Label>
            <Input maxLength={50} placeholder="ex: 001/2026" value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Órgão Licitante</Label>
            <Input maxLength={200} placeholder="ex: Prefeitura Municipal de SP" value={form.orgao_licitante} onChange={(e) => setForm({ ...form, orgao_licitante: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Valor Estimado (R$)</Label>
            <Input type="number" step="0.01" placeholder="0,00" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Modalidade</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.modalidade} onChange={(e) => setForm({ ...form, modalidade: e.target.value as LicitacaoModalidade })}>
              <option value="">— selecionar —</option>
              {MODALIDADES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável Interno</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.responsavel_id} onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}>
              <option value="">— nenhum —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name ?? u.email}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Data de Abertura</Label>
            <Input type="date" value={form.data_abertura} onChange={(e) => setForm({ ...form, data_abertura: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Vencimento do Contrato</Label>
            <Input type="date" value={form.data_vencimento} onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Status inicial</Label>
            <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LicitacaoStatus })}>
              {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Observações</Label>
            <Textarea rows={3} placeholder="Notas adicionais…" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </div>
        </div>
        <DialogFooter className="gap-2 mt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={submit} disabled={busy || !form.titulo.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Criar Licitação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
