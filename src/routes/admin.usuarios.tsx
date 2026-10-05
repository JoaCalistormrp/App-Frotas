import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Users, Plus, ShieldCheck, Eye, Wrench, Truck, TrendingDown,
  KeyRound, Trash2, Loader2, SlidersHorizontal, X, UserCog, RefreshCw, Gavel,
  Monitor, CheckCircle2, XCircle, Copy, CalendarDays, Smartphone,
} from "lucide-react";
import {
  listStaff, createStaffUser, updateStaffUser, deleteStaffUser, resetStaffPassword,
} from "@/lib/staff.functions";

export const Route = createFileRoute("/admin/usuarios")({ component: UsuariosPage });

// ── Módulos do ERP ─────────────────────────────────────────────────────────────
type ScreenItem = { slug: string; label: string; subscreens?: { slug: string; label: string }[] };
type PermissionLevel = { slug: string; label: string };

const MODULES_CONFIG: Array<{
  slug: string;
  label: string;
  icon: React.ElementType;
  description: string;
  screens: ScreenItem[];
  permissionLevels?: PermissionLevel[];
}> = [
  {
    slug: "frotas",
    label: "Frotas",
    icon: Truck,
    description: "Checklists, Manutenção, Veículos, Motoristas",
    screens: [
      { slug: "frotas.dashboard",     label: "Dashboard" },
      {
        slug: "frotas.checklists",
        label: "Checklists",
        subscreens: [
          { slug: "frotas.checklists.pesados",        label: "Pesados" },
          { slug: "frotas.checklists.cesto_aereo",  label: "Cesto Aéreo" },
          { slug: "frotas.checklists.operacionais", label: "Operacional" },
          { slug: "frotas.checklists.maquinario",   label: "Maquinário" },
          { slug: "frotas.checklists.munck",        label: "Munck" },
          { slug: "frotas.checklists.administrativo", label: "Administrativo" },
        ],
      },
      { slug: "frotas.checklist_new", label: "Abrir Checklist" },
      { slug: "frotas.manutencao",    label: "Manutenção" },
      { slug: "frotas.veiculos",      label: "Veículos" },
      { slug: "frotas.motoristas",    label: "Motoristas" },
      { slug: "frotas.lixeira",       label: "Lixeira" },
    ] as ScreenItem[],
  },
  {
    slug: "frotas.agendamento",
    label: "Agendamento de Veículos",
    icon: CalendarDays,
    description: "Reservas e agendamentos de serviço por veículo",
    screens: [] as ScreenItem[],
    permissionLevels: [
      { slug: "frotas.agendamento",          label: "Incluir / Visualizar" },
      { slug: "frotas.agendamento.readonly", label: "Somente Visualizar"  },
    ],
  },
  {
    slug: "financeiro",
    label: "Financeiro Frotas",
    icon: TrendingDown,
    description: "Vínculos financeiros de OS",
    screens: [] as ScreenItem[],
  },
  {
    slug: "utilizadores",
    label: "Usuários",
    icon: ShieldCheck,
    description: "Gestão de utilizadores e acessos do ERP",
    screens: [] as ScreenItem[],
  },
  {
    slug: "licitacao",
    label: "Licitações",
    icon: Gavel,
    description: "Módulo de licitações — acesso restrito por dispositivo autorizado",
    screens: [] as ScreenItem[],
  },
];

const ROLES = [
  { value: "viewer", label: "Consulta (somente leitura)" },
  { value: "geral",  label: "Geral" },
];

const LEGACY_ROLE_LABELS: Record<string, string> = {
  admin: "Administrador",
  master: "Master (admin + aprovações)",
  mechanic: "Mecânico (SMI/SMV)",
  driver: "Motorista",
};

const ROLE_STYLE: Record<string, string> = {
  admin:    "bg-primary/10 text-primary",
  master:   "bg-violet-500/10 text-violet-600",
  viewer:   "bg-amber-500/10 text-amber-600",
  mechanic: "bg-blue-500/10 text-blue-600",
  geral:    "bg-orange-500/10 text-orange-600",
  driver:   "bg-emerald-500/10 text-emerald-600",
};

// ── Types ──────────────────────────────────────────────────────────────────────
type StaffUser = {
  id: string; email: string; full_name: string | null; cpf: string | null; phone: string | null;
  roles: string[]; driver_active: boolean; modules: string[];
};

type NewForm = { full_name: string; email: string; cpf: string; phone: string; role: string; driver_active: boolean; modules: string[] };
type EditForm = { full_name: string; cpf: string; phone: string; role: string; driver_active: boolean; modules: string[] };

const EMPTY_NEW: NewForm = { full_name: "", email: "", cpf: "", phone: "", role: "viewer", driver_active: false, modules: [] };

// ── Helpers ────────────────────────────────────────────────────────────────────
function toggleArr(arr: string[], val: string) {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLES.find((r) => r.value === role)?.label ?? LEGACY_ROLE_LABELS[role] ?? role;
  return (
    <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-medium ${ROLE_STYLE[role] ?? "bg-muted text-muted-foreground"}`}>
      <ShieldCheck className="size-3 inline mr-0.5" />{label}
    </span>
  );
}

function ModulesSection({
  selected, onChange,
}: { selected: string[]; onChange: (m: string[]) => void }) {
  return (
    <div className="space-y-2">
      {MODULES_CONFIG.map((mod) => {
        const hasPermLevels = !!mod.permissionLevels?.length;
        const permLevelSlugs = mod.permissionLevels?.map((l) => l.slug) ?? [];
        const activePermSlug = permLevelSlugs.find((s) => selected.includes(s)) ?? null;

        const hasScreens = mod.screens.length > 0;
        const screenSlugs = mod.screens.map((s) => s.slug);
        const selectedScreens = screenSlugs.filter((s) => selected.includes(s));

        const isActive = hasPermLevels
          ? !!activePermSlug
          : hasScreens ? selectedScreens.length > 0 : selected.includes(mod.slug);

        const isPartial = !hasPermLevels && hasScreens &&
          selectedScreens.length > 0 && selectedScreens.length < screenSlugs.length;

        const allSubSlugs = mod.screens.flatMap((s) => s.subscreens?.map((ss) => ss.slug) ?? []);
        const allSlugs = [...screenSlugs, ...allSubSlugs];

        const toggleModule = () => {
          if (hasPermLevels) {
            if (activePermSlug) {
              onChange(selected.filter((s) => !permLevelSlugs.includes(s)));
            } else {
              onChange([...selected.filter((s) => !permLevelSlugs.includes(s)), permLevelSlugs[0]]);
            }
          } else if (!hasScreens) {
            onChange(toggleArr(selected, mod.slug));
          } else if (isActive) {
            onChange(selected.filter((s) => !allSlugs.includes(s)));
          } else {
            onChange([...selected.filter((s) => !allSlugs.includes(s)), ...screenSlugs]);
          }
        };

        const toggleScreen = (slug: string) => onChange(toggleArr(selected, slug));
        const setPermLevel = (slug: string) =>
          onChange([...selected.filter((s) => !permLevelSlugs.includes(s)), slug]);

        return (
          <div
            key={mod.slug}
            className={`rounded-lg border transition-all ${
              isActive ? "border-primary ring-1 ring-primary" : "border-border"
            }`}
          >
            {/* Module header */}
            <button
              type="button"
              onClick={toggleModule}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-lg transition-colors ${
                isActive ? "bg-primary/5" : "hover:bg-accent/30"
              }`}
            >
              <mod.icon className={`size-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${isActive ? "text-primary" : ""}`}>{mod.label}</div>
                <div className="text-[11px] text-muted-foreground">{mod.description}</div>
              </div>
              {/* Checkbox indicator */}
              <div className={`size-4 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                isActive ? "border-primary bg-primary" : "border-border"
              }`}>
                {isPartial && <span className="text-[9px] text-primary-foreground font-bold leading-none">—</span>}
                {isActive && !isPartial && <X className="size-3 text-primary-foreground" strokeWidth={3} />}
              </div>
            </button>

            {/* Permission levels — shown when module is active and uses permissionLevels */}
            {hasPermLevels && isActive && (
              <div className="border-t border-primary/20 px-3 pt-2.5 pb-3">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Nível de acesso
                </p>
                <div className="flex flex-col gap-2">
                  {mod.permissionLevels!.map((level) => (
                    <label key={level.slug} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`perm-${mod.slug}`}
                        checked={activePermSlug === level.slug}
                        onChange={() => setPermLevel(level.slug)}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                      <span className={`text-xs ${activePermSlug === level.slug ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                        {level.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Screen list — shown when module is active and has screens */}
            {hasScreens && isActive && (
              <div className="border-t border-primary/20 px-3 pt-2.5 pb-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Telas acessíveis
                </p>

                {/* Screens without subscreens — 2-col grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                  {mod.screens.filter((s) => !s.subscreens).map((screen) => {
                    const checked = selected.includes(screen.slug);
                    return (
                      <label key={screen.slug} className="flex items-center gap-2 cursor-pointer select-none group">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScreen(screen.slug)}
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                        <span className={`text-xs ${checked ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {screen.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Screens with subscreens (ex: Checklists) */}
                {mod.screens.filter((s) => s.subscreens).map((screen) => {
                  const checked = selected.includes(screen.slug);
                  const subSlugs = screen.subscreens!.map((ss) => ss.slug);
                  const activeSubCount = subSlugs.filter((s) => selected.includes(s)).length;
                  return (
                    <div key={screen.slug} className={`rounded border transition-all ${checked ? "border-primary/40" : "border-border"}`}>
                      <label className="flex items-center gap-2 cursor-pointer select-none px-2.5 py-1.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            if (checked) {
                              onChange(selected.filter((s) => s !== screen.slug && !subSlugs.includes(s)));
                            } else {
                              onChange([...selected, screen.slug]);
                            }
                          }}
                          className="h-3.5 w-3.5 rounded accent-primary"
                        />
                        <span className={`text-xs flex-1 ${checked ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {screen.label}
                        </span>
                        {checked && activeSubCount > 0 && (
                          <span className="text-[10px] text-primary shrink-0">{activeSubCount}/{subSlugs.length} tipos</span>
                        )}
                      </label>
                      {checked && (
                        <div className="border-t border-primary/20 px-3 py-2">
                          <p className="text-[10px] text-muted-foreground mb-1.5">
                            Tipos de checklist <span className="italic">(sem seleção = todos)</span>
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                            {screen.subscreens!.map((sub) => {
                              const subChecked = selected.includes(sub.slug);
                              return (
                                <label key={sub.slug} className="flex items-center gap-1.5 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={subChecked}
                                    onChange={() => toggleScreen(sub.slug)}
                                    className="h-3 w-3 rounded accent-primary"
                                  />
                                  <span className={`text-[11px] ${subChecked ? "text-foreground" : "text-muted-foreground"}`}>
                                    {sub.label}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
function UsuariosPage() {
  const { isAdmin, isViewer, modules, user, loading: authLoading, reloadModules } = useAuth();
  const listFn    = useServerFn(listStaff);
  const createFn  = useServerFn(createStaffUser);
  const updateFn  = useServerFn(updateStaffUser);
  const deleteFn  = useServerFn(deleteStaffUser);
  const resetFn   = useServerFn(resetStaffPassword);

  const [staff, setStaff]         = useState<StaffUser[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // New user dialog
  const [showNew, setShowNew]       = useState(false);
  const [newForm, setNewForm]       = useState<NewForm>(EMPTY_NEW);
  const [creating, setCreating]     = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);

  // Edit sheet
  const [editUser, setEditUser]   = useState<StaffUser | null>(null);
  const [editForm, setEditForm]   = useState<EditForm | null>(null);
  const [saving, setSaving]       = useState(false);

  // Password sub-dialog
  const [pwdUser, setPwdUser]   = useState<StaffUser | null>(null);
  const [newPwd, setNewPwd]     = useState("");
  const [resetting, setResetting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const result = await listFn();
      if (!Array.isArray(result)) {
        console.error("[listStaff] resposta inesperada:", result);
        toast.error("Erro ao carregar utilizadores. Tente novamente.");
        setStaff([]);
      } else {
        setStaff(result as StaffUser[]);
      }
    }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (authLoading) return <div className="py-12 text-center text-muted-foreground text-sm">Carregando…</div>;
  if (!user || (!isAdmin && !isViewer)) return <Navigate to="/" />;
  if (!modules.includes("utilizadores")) return <Navigate to="/home" />;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = staff.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.full_name ?? "").toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.cpf ?? "").includes(q)
    );
  });

  // ── New user ──────────────────────────────────────────────────────────────
  const closeNew = () => { setShowNew(false); setNewForm(EMPTY_NEW); };
  const submitNew = async (e: React.FormEvent) => {
    e.preventDefault(); setCreating(true);
    try {
      const result = await createFn({ data: { ...newForm, role: newForm.role as never } });
      closeNew();
      setCreatedPassword((result as { id: string; tempPassword: string }).tempPassword);
      load();
    } catch (err) { toast.error((err as Error).message); }
    finally { setCreating(false); }
  };

  // ── Edit user ─────────────────────────────────────────────────────────────
  const openEdit = (s: StaffUser) => {
    setEditUser(s);
    setEditForm({ full_name: s.full_name ?? "", cpf: s.cpf ?? "", phone: s.phone ?? "", role: s.roles[0] ?? "viewer", driver_active: s.driver_active, modules: [...s.modules] });
  };
  const closeEdit = () => { setEditUser(null); setEditForm(null); };

  const saveEdit = async () => {
    if (!editUser || !editForm) return;
    setSaving(true);
    try {
      await updateFn({ data: { user_id: editUser.id, ...editForm, role: editForm.role as never } });
      toast.success("Utilizador atualizado!");
      // If editing own account, reload modules in the active session immediately
      if (editUser.id === user?.id) await reloadModules();
      closeEdit(); load();
    } catch (err) { toast.error((err as Error).message); }
    finally { setSaving(false); }
  };

  const deleteUser = async (s: StaffUser) => {
    if (!confirm(`Remover acesso de ${s.full_name ?? s.email}? Esta ação não pode ser desfeita.`)) return;
    try { await deleteFn({ data: { user_id: s.id } }); toast.success("Utilizador removido."); closeEdit(); load(); }
    catch (err) { toast.error((err as Error).message); }
  };

  // ── Password reset ────────────────────────────────────────────────────────
  const openPwd = (s: StaffUser) => { setPwdUser(s); setNewPwd(""); };
  const closePwd = () => { setPwdUser(null); setNewPwd(""); };
  const submitPwd = async (e: React.FormEvent) => {
    e.preventDefault(); setResetting(true);
    try {
      await resetFn({ data: { user_id: pwdUser!.id, password: newPwd } });
      toast.success("Senha redefinida.");
      closePwd();
    } catch (err) { toast.error((err as Error).message); }
    finally { setResetting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="size-6" />Usuários & Acessos</h1>
          <p className="text-sm text-muted-foreground">Gestão de utilizadores, perfis e módulos de acesso do ERP.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={showFilter ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilter((v) => !v)}
            className="gap-1.5"
          >
            <SlidersHorizontal className="size-4" /> Filtros
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={async () => { await reloadModules(); toast.success("Sessão atualizada."); }}
            title="Recarrega os módulos do utilizador atual sem precisar de fazer logout"
          >
            <RefreshCw className="size-4" /> Recarregar sessão
          </Button>
          <Button onClick={() => setShowNew(true)} className="gap-1.5">
            <Plus className="size-4" /> Novo utilizador
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <Card className="p-3 border-dashed border-primary/30 bg-primary/[0.02]">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Pesquisar (nome, e-mail, CPF)</Label>
            <Input
              placeholder="Pesquisar…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
        </Card>
      )}

      {/* User list */}
      <Card className="divide-y divide-border">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> Carregando…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Users className="size-8 mx-auto mb-2 opacity-30" />
            {search ? "Nenhum utilizador encontrado." : "Nenhum utilizador cadastrado."}
          </div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => openEdit(s)}
            className="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-accent/30 transition-colors text-left"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-sm">{s.full_name ?? "—"}</span>
                {s.roles.map((r) => <RoleBadge key={r} role={r} />)}
                {s.driver_active && (
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 font-medium">
                    Motorista ativo
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">{s.email}{s.cpf ? ` · CPF ${s.cpf}` : ""}{s.phone ? ` · Tel. ${s.phone}` : ""}</div>
              {s.modules.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {MODULES_CONFIG.flatMap((mod) => {
                    const Icon = mod.icon;
                    if (mod.screens.length === 0) {
                      if (!s.modules.includes(mod.slug)) return [];
                      return [<span key={mod.slug} className="text-[10px] flex items-center gap-1 bg-muted text-muted-foreground px-1.5 py-0.5 rounded"><Icon className="size-3" />{mod.label}</span>];
                    }
                    const screenSlugs = mod.screens.map((sc) => sc.slug);
                    const count = screenSlugs.filter((sc) => s.modules.includes(sc)).length;
                    const legacy = s.modules.includes(mod.slug);
                    if (count === 0 && !legacy) return [];
                    const display = legacy ? mod.screens.length : count;
                    return [<span key={mod.slug} className="text-[10px] flex items-center gap-1 bg-muted text-muted-foreground px-1.5 py-0.5 rounded"><Icon className="size-3" />{mod.label} ({display}/{mod.screens.length})</span>];
                  })}
                </div>
              )}
            </div>
            <span className="text-xs text-muted-foreground shrink-0">Editar →</span>
          </button>
        ))}
      </Card>

      {/* ── Dialog: Novo utilizador ──────────────────────────────────────── */}
      <Dialog open={showNew} onOpenChange={(open) => { if (!open) closeNew(); }}>
        <DialogContent className="w-[95vw] max-w-lg sm:w-full max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Novo utilizador
            </DialogTitle>
            <DialogDescription>
              A senha inicial será o CPF sem formatação (apenas números).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitNew} className="space-y-4 py-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Nome completo</Label>
                <Input value={newForm.full_name} onChange={(e) => setNewForm({ ...newForm, full_name: e.target.value })} placeholder="João da Silva" required />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>E-mail <span className="text-muted-foreground text-[11px] font-normal">(opcional — gerado pelo CPF se vazio)</span></Label>
                <Input type="email" value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} placeholder="joao@empresa.com" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>CPF</Label>
                <Input value={newForm.cpf} onChange={(e) => setNewForm({ ...newForm, cpf: e.target.value })} placeholder="000.000.000-00" required minLength={11} />
                <p className="text-[11px] text-muted-foreground">Será a senha inicial de acesso.</p>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="flex items-center gap-1.5"><Smartphone className="size-3.5" />Telefone WhatsApp <span className="text-muted-foreground text-[11px] font-normal">(opcional)</span></Label>
                <Input value={newForm.phone} onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })} placeholder="(15) 98107-2085 ou 5515981072085" />
                <p className="text-[11px] text-muted-foreground">Formatado automaticamente para o padrão WhatsApp (55XXXXXXXXXXX).</p>
              </div>
              <div className="space-y-1.5">
                <Label>Perfil</Label>
                <select
                  value={newForm.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    setNewForm({ ...newForm, role });
                  }}
                  className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
                >
                  {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={newForm.driver_active} onChange={(e) => setNewForm({ ...newForm, driver_active: e.target.checked })} className="h-4 w-4 rounded border-border" />
                  Motorista ativo
                </label>
              </div>
            </div>

            <>
              <Separator />
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Truck className="size-3.5" /> Módulos de acesso
                </Label>
                <ModulesSection selected={newForm.modules} onChange={(m) => setNewForm({ ...newForm, modules: m })} />
              </div>
            </>

            <DialogFooter className="gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={closeNew} disabled={creating}>Cancelar</Button>
              <Button type="submit" disabled={creating}>
                {creating ? <><Loader2 className="size-4 mr-2 animate-spin" />Cadastrando…</> : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Sheet: Editar utilizador ─────────────────────────────────────── */}
      <Sheet open={!!editUser} onOpenChange={(open) => { if (!open) closeEdit(); }}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {editUser && editForm && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle className="flex items-center gap-2">
                  <UserCog className="size-4 text-primary" /> {editUser.full_name ?? editUser.email}
                </SheetTitle>
                <SheetDescription>{editUser.email}</SheetDescription>
              </SheetHeader>

              <div className="space-y-5">
                {/* Informações */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Informações</h3>
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome completo</Label>
                      <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">CPF</Label>
                      <Input value={editForm.cpf} onChange={(e) => setEditForm({ ...editForm, cpf: e.target.value })} placeholder="000.000.000-00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs flex items-center gap-1.5"><Smartphone className="size-3" />Telefone WhatsApp</Label>
                      <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} placeholder="(15) 98107-2085 ou 5515981072085" />
                      {editForm.phone && (
                        <p className="text-[11px] text-muted-foreground">Armazenado como: {editForm.phone.replace(/\D/g, "").startsWith("55") ? editForm.phone.replace(/\D/g, "") : "55" + editForm.phone.replace(/\D/g, "")}</p>
                      )}
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Perfil */}
                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Perfil & Acesso</h3>
                  <div className="space-y-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Perfil</Label>
                      <select
                        value={editForm.role}
                        onChange={(e) => {
                          const role = e.target.value;
                          setEditForm({ ...editForm, role });
                        }}
                        className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm"
                      >
                        {!ROLES.some((r) => r.value === editForm.role) && (
                          <option value={editForm.role} disabled>{LEGACY_ROLE_LABELS[editForm.role] ?? editForm.role}</option>
                        )}
                        {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer select-none pt-1">
                      <input type="checkbox" checked={editForm.driver_active} onChange={(e) => setEditForm({ ...editForm, driver_active: e.target.checked })} className="h-4 w-4 rounded border-border" />
                      Motorista ativo
                    </label>
                  </div>
                </section>

                <>
                  <Separator />
                  <section className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                      <Truck className="size-3.5" /> Módulos de acesso
                    </h3>
                    <ModulesSection selected={editForm.modules} onChange={(m) => setEditForm({ ...editForm, modules: m })} />
                  </section>
                </>

                {/* Dispositivos autorizados – Licitação */}
                {(editForm.modules.includes("licitacao") || editUser.roles.some(r => ["admin","master"].includes(r))) && (
                  <>
                    <Separator />
                    <section className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider flex items-center gap-1.5">
                        <Gavel className="size-3.5" /> Dispositivos — Licitações
                      </h3>
                      <DevicesPanel userId={editUser.id} />
                    </section>
                  </>
                )}

                <Separator />

                {/* Ações */}
                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Ações</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => openPwd(editUser)}>
                      <KeyRound className="size-3.5" /> Alterar senha
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => deleteUser(editUser)}>
                      <Trash2 className="size-3.5" /> Excluir utilizador
                    </Button>
                  </div>
                </section>

                {/* Save */}
                <div className="flex gap-2 pt-2">
                  <Button variant="ghost" className="flex-1" onClick={closeEdit} disabled={saving}>Cancelar</Button>
                  <Button className="flex-1" onClick={saveEdit} disabled={saving}>
                    {saving ? <><Loader2 className="size-4 mr-2 animate-spin" />Guardando…</> : "Guardar alterações"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Dialog: Senha temporária do utilizador criado ──────────────── */}
      <Dialog open={!!createdPassword} onOpenChange={(open) => { if (!open) setCreatedPassword(null); }}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Utilizador criado
            </DialogTitle>
            <DialogDescription>
              Guarde a senha temporária abaixo. Ela não poderá ser recuperada depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Senha temporária</Label>
              <div className="flex gap-2">
                <Input readOnly value={createdPassword ?? ""} className="font-mono text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(createdPassword ?? "");
                    toast.success("Copiado!");
                  }}
                >
                  <Copy className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              O utilizador deverá alterar a senha no primeiro acesso via painel de perfil.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreatedPassword(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Alterar senha ────────────────────────────────────────── */}
      <Dialog open={!!pwdUser} onOpenChange={(open) => { if (!open) closePwd(); }}>
        <DialogContent className="w-[95vw] max-w-sm sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" /> Alterar senha
            </DialogTitle>
            <DialogDescription>{pwdUser?.full_name ?? pwdUser?.email}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPwd} className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nova senha (mín. 8 caracteres)</Label>
              <Input
                type="text"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="Nova senha…"
                required
                minLength={8}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={closePwd} disabled={resetting}>Cancelar</Button>
              <Button type="submit" disabled={resetting || newPwd.length < 8}>
                {resetting ? <><Loader2 className="size-4 mr-2 animate-spin" />Redefinindo…</> : "Redefinir senha"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Painel de dispositivos autorizados ──────────────────────────────────────
import { supabase } from "@/integrations/supabase/client";

type TrustedDevice = {
  id: string;
  user_id: string;
  token: string;
  device_label: string | null;
  ip_address: string | null;
  approved: boolean;
  created_at: string;
  approved_at: string | null;
};

function DevicesPanel({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<TrustedDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("licitacao_trusted_devices" as any)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    setDevices((data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const approve = async (id: string) => {
    setBusy(id);
    await supabase
      .from("licitacao_trusted_devices" as any)
      .update({ approved: true, approved_at: new Date().toISOString() })
      .eq("id", id);
    setBusy(null);
    load();
  };

  const revoke = async (id: string) => {
    setBusy(id);
    await supabase.from("licitacao_trusted_devices" as any).delete().eq("id", id);
    setBusy(null);
    load();
  };

  if (loading) return <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="size-3 animate-spin" /> Carregando…</div>;

  if (devices.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Nenhum dispositivo registado. O utilizador acederá ao módulo pela primeira vez e o dispositivo aparecerá aqui para aprovação.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {devices.map((d) => (
        <div key={d.id} className={`rounded-lg border px-3 py-2.5 flex items-start gap-3 text-xs ${d.approved ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800" : "border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-800"}`}>
          <Monitor className={`size-4 shrink-0 mt-0.5 ${d.approved ? "text-emerald-600" : "text-amber-600"}`} />
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-semibold text-foreground truncate">{d.device_label ?? "Dispositivo desconhecido"}</p>
            {d.ip_address && <p className="text-muted-foreground">IP: {d.ip_address}</p>}
            <p className="text-muted-foreground">Registado: {new Date(d.created_at).toLocaleDateString("pt-BR")}</p>
            {d.approved && d.approved_at && <p className="text-muted-foreground">Aprovado: {new Date(d.approved_at).toLocaleDateString("pt-BR")}</p>}
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            {!d.approved && (
              <Button size="sm" className="h-6 text-[10px] px-2 gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => approve(d.id)} disabled={busy === d.id}>
                {busy === d.id ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
                Aprovar
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 gap-1 text-rose-600 border-rose-300 hover:bg-rose-50" onClick={() => revoke(d.id)} disabled={busy === d.id}>
              <XCircle className="size-3" /> Revogar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
