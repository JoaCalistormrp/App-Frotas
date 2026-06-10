import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { UserCog, Trash2, KeyRound, Plus, ShieldCheck, Eye, Wrench } from "lucide-react";
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
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "viewer" as "admin" | "viewer" | "mechanic" | "master" | "driver", driver_active: false });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setStaff((await list()) as Staff[]); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (isAdmin) load(); }, [isAdmin]);

  if (!isAdmin) return <Navigate to="/admin" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      await create({ data: form });
      toast.success("Acesso criado");
      setForm({ full_name: "", email: "", password: "", role: "viewer", driver_active: false });
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
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><UserCog className="size-6" />Equipe & Acessos</h1>
        <p className="text-sm text-muted-foreground">Cadastro e exibição de todos os usuários, incluindo motoristas ativos.</p>
      </div>

      <Card className="p-5">
        <div className="font-semibold mb-3 flex items-center gap-2"><Plus className="size-4" />Novo acesso</div>
        <form onSubmit={submit} className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="md:col-span-2"><Label className="text-xs">Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
          <div className="md:col-span-2"><Label className="text-xs">E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          <div><Label className="text-xs">Perfil</Label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as never })} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="viewer">Consulta (somente leitura)</option>
              <option value="admin">Administrador</option>
              <option value="master">Master (admin + aprovação SMV/SMI)</option>
              <option value="mechanic">Mecânico (SMI/SMV)</option>
              <option value="driver">Motorista</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-2">
              <input id="driver-active" type="checkbox" checked={form.driver_active} onChange={(e) => setForm({ ...form, driver_active: e.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
              <label htmlFor="driver-active" className="text-xs">Motorista ativo</label>
            </div>
          </div>
          <div className="md:col-span-4"><Label className="text-xs">Senha provisória (mín. 8)</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} /></div>
          <div className="flex items-end"><Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "Criar"}</Button></div>
        </form>
      </Card>

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