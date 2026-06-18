import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserCog, Trash2, KeyRound, Plus, ShieldCheck, Eye, Wrench, X as XIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth";
import { listStaff, createStaffUser, updateStaffProfile, deleteStaffUser, resetStaffPassword } from "@/lib/staff.functions";

export const Route = createFileRoute("/admin/team")({ component: TeamPage });

type Staff = { id: string; email: string; full_name: string | null; roles: string[]; driver_active: boolean };
const ROLE_LABEL: Record<string, { label: string; icon: typeof ShieldCheck; tone: string }> = {
  admin: { label: "Administrador", icon: ShieldCheck, tone: "bg-primary/10 text-primary" },
  master: { label: "Master", icon: ShieldCheck, tone: "bg-violet-500/10 text-violet-600" },
  viewer: { label: "Consulta", icon: Eye, tone: "bg-amber-500/10 text-amber-600" },
  mechanic: { label: "Mecânico", icon: Wrench, tone: "bg-blue-500/10 text-blue-600" },
  driver: { label: "Motorista", icon: ShieldCheck, tone: "bg-emerald-500/10 text-emerald-600" },
};

function TeamPage() {
  const { isAdmin } = useAuth();
  const list = useServerFn(listStaff);
  const create = useServerFn(createStaffUser);
  const updateProfile = useServerFn(updateStaffProfile);
  const del = useServerFn(deleteStaffUser);
  const reset = useServerFn(resetStaffPassword);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", cpf: "", role: "viewer" as "admin" | "viewer" | "mechanic" | "master" | "driver", driver_active: false });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setStaff((await list()) as Staff[]); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const closeNew = () => {
    setShowNew(false);
    setForm({ full_name: "", email: "", cpf: "", role: "viewer", driver_active: false });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await create({ data: form });
      toast.success("Utilizador criado! A senha inicial é o CPF (apenas números).");
      closeNew();
      load();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const remove = async (s: Staff) => {
    if (!confirm(`Remover acesso de ${s.full_name ?? s.email}?`)) return;
    try { await del({ data: { user_id: s.id } }); toast.success("Removido"); load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  const toggleDriverActive = async (s: Staff) => {
    try {
      await updateProfile({ data: { user_id: s.id, driver_active: !s.driver_active } });
      toast.success(`Motorista ${s.driver_active ? "inativado" : "ativado"}`);
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  const changePwd = async (s: Staff) => {
    const pwd = prompt(`Nova senha para ${s.email} (mín. 8):`);
    if (!pwd || pwd.length < 8) return;
    try { await reset({ data: { user_id: s.id, password: pwd } }); toast.success("Senha redefinida"); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="size-6" />Equipe & Acessos</h1>
          <p className="text-sm text-muted-foreground">Cadastro e exibição de todos os usuários, incluindo motoristas ativos.</p>
        </div>
        <Button onClick={() => setShowNew(true)} className="gap-1.5">
          <Plus className="size-4" /> Novo usuário
        </Button>
      </div>

      <Dialog open={showNew} onOpenChange={(open) => { if (!open) closeNew(); }}>
        <DialogContent className="w-[95vw] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="size-4 text-primary" /> Novo usuário
            </DialogTitle>
            <DialogDescription>
              A senha inicial será o CPF do utilizador (apenas os números).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Nome completo</Label>
              <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="João da Silva" required />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="joao@empresa.com" required />
            </div>
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} placeholder="000.000.000-00" required minLength={11} />
              <p className="text-[11px] text-muted-foreground">Será usado como senha inicial de acesso.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Perfil</Label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as never })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
                <option value="viewer">Consulta (somente leitura)</option>
                <option value="driver">Motorista</option>
                <option value="mechanic">Mecânico (SMI/SMV)</option>
                <option value="admin">Administrador</option>
                <option value="master">Master (admin + aprovação SMV/SMI)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input id="driver-active-dlg" type="checkbox" checked={form.driver_active} onChange={(e) => setForm({ ...form, driver_active: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              <label htmlFor="driver-active-dlg" className="text-sm">Motorista ativo</label>
            </div>
            <DialogFooter className="pt-2 gap-2">
              <Button type="button" variant="ghost" onClick={closeNew} disabled={busy}>Cancelar</Button>
              <Button type="submit" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Card className="p-5">
        <div className="font-semibold mb-3">{staff.length} usuário(s) cadastrados</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        <div className="divide-y divide-border">
          {staff.map((s) => (
            <div key={s.id} className="py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-sm">{s.full_name ?? "—"}</div>
                <div className="text-xs text-muted-foreground truncate">{s.email}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {s.roles.map((r) => {
                    const info = ROLE_LABEL[r];
                    if (!info) return null;
                    const Icon = info.icon;
                    return <span key={r} className={`text-[10px] uppercase px-2 py-0.5 rounded flex items-center gap-1 ${info.tone}`}><Icon className="size-3" />{info.label}</span>;
                  })}
                  {s.driver_active && <span className="text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700">Motorista ativo</span>}
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant={s.driver_active ? "secondary" : "outline"} onClick={() => toggleDriverActive(s)}>{s.driver_active ? "Inativar motorista" : "Ativar motorista"}</Button>
                <Button size="sm" variant="outline" onClick={() => changePwd(s)}><KeyRound className="size-3" />Senha</Button>
                <Button size="sm" variant="destructive" onClick={() => remove(s)}><Trash2 className="size-3" />Remover</Button>
              </div>
            </div>
          ))}
          {!loading && staff.length === 0 && <div className="text-sm text-muted-foreground py-4">Nenhum membro cadastrado.</div>}
        </div>
      </Card>
    </div>
  );
}