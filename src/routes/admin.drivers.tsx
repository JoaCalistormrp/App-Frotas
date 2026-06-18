import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Users, X as XIcon, Upload, FileText, Camera, History, Plus, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/admin/drivers")({ component: DriversPage });

type Driver = {
  id: string; full_name: string | null; cpf: string | null; cnh: string | null;
  cnh_category: string | null; cnh_expires_at: string | null; cnh_file_url: string | null;
  cnh_photo_url: string | null; phone: string | null; company: string | null;
  base: string | null; role_function: string | null; unlock_card: string | null;
  driver_active?: boolean | null;
  cnh_renewal_history?: Array<{ date: string; new_expiry: string | null; note?: string }> | null;
};

const FUNCTIONS = [
  { v: "diretor", l: "Diretor" }, { v: "administrativo", l: "Administrativo" },
  { v: "encarregado", l: "Encarregado" }, { v: "motorista", l: "Motorista" },
];

function daysUntil(d: string | null): number | null {
  if (!d) return null; const x = new Date(d + "T00:00:00"); const t = new Date(); t.setHours(0,0,0,0);
  return Math.floor((x.getTime() - t.getTime()) / 86400000);
}
function cnhStatus(d: string | null) {
  const n = daysUntil(d);
  if (n === null) return { label: "Sem data", tone: "muted" as const };
  if (n < 0) return { label: `Vencida há ${Math.abs(n)}d`, tone: "danger" as const };
  if (n <= 30) return { label: `Vence em ${n}d`, tone: "warn" as const };
  return { label: `Válida (${n}d)`, tone: "ok" as const };
}

function DriversPage() {
  const [list, setList] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [funcFilter, setFuncFilter] = useState("");
  const [baseFilter, setBaseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"ok"|"warn"|"danger"|"missing">("all");
  const [showFilter, setShowFilter] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);

  const activeFilterCount = [search, funcFilter, baseFilter, statusFilter !== "all" ? statusFilter : ""].filter(Boolean).length;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*").eq("driver_active", true).order("full_name");
    setList((data ?? []) as unknown as Driver[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = list.filter((d) => {
    if (search && !`${d.full_name ?? ""} ${d.cpf ?? ""} ${d.cnh ?? ""} ${d.phone ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (funcFilter && d.role_function !== funcFilter) return false;
    if (baseFilter && !(d.base ?? "").toLowerCase().includes(baseFilter.toLowerCase())) return false;
    if (statusFilter !== "all") {
      if (statusFilter === "missing") { if (d.cnh_expires_at) return false; }
      else if (cnhStatus(d.cnh_expires_at).tone !== statusFilter) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="size-6" />Motoristas ativos</h1>
          <p className="text-sm text-muted-foreground">Apenas motoristas com status ativo no cadastro de usuário são exibidos aqui.</p>
        </div>
        <Button
          variant={showFilter ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowFilter((v) => !v)}
          className="relative gap-1.5"
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </Button>
      </div>

      {showFilter && (
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-dashed border-primary/30 bg-primary/[0.02]">
          <div className="md:col-span-2"><Label className="text-xs">Buscar (nome, CPF, CNH, telefone)</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          <div><Label className="text-xs">Função</Label>
            <select value={funcFilter} onChange={(e) => setFuncFilter(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">Todas</option>{FUNCTIONS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Base</Label><Input value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)} /></div>
          <div className="md:col-span-2"><Label className="text-xs">Status da CNH</Label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="all">Todos</option><option value="ok">Válida</option>
              <option value="warn">A vencer (30d)</option><option value="danger">Vencida</option><option value="missing">Sem cadastro</option>
            </select>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{filtered.length} pessoa(s)</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        <div className="divide-y divide-border max-h-[60vh] overflow-auto">
          {filtered.map((d) => {
            const st = cnhStatus(d.cnh_expires_at);
            const tone = st.tone === "danger" ? "text-destructive" : st.tone === "warn" ? "text-amber-600" : st.tone === "ok" ? "text-green-600" : "text-muted-foreground";
            return (
              <button key={d.id} onClick={() => setEditing(d)} className="w-full py-2 px-1 flex items-center justify-between gap-2 text-sm hover:bg-muted/30 rounded text-left">
                <div className="min-w-0">
                  <div className="font-bold truncate">{d.full_name ?? "—"}
                    {d.role_function && <span className="ml-2 text-[10px] uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">{FUNCTIONS.find((f) => f.v === d.role_function)?.l ?? d.role_function}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {d.cpf ? `CPF ${d.cpf}` : "sem CPF"} {d.cnh ? `• CNH ${d.cnh}` : ""} {d.cnh_category ? `(${d.cnh_category})` : ""}{d.base ? ` • ${d.base}` : ""}
                  </div>
                </div>
                <div className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${tone}`}>
                  {d.cnh_file_url && <FileText className="size-3" />}{st.label}
                </div>
              </button>
            );
          })}
          {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground py-4">Nenhum cadastro.</div>}
        </div>
      </Card>

      {editing && <DriverModal driver={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function DriverModal({ driver, onClose, onSaved }: { driver: Driver; onClose: () => void; onSaved: () => void }) {
  const [fullName, setFullName] = useState(driver.full_name ?? "");
  const [cpf, setCpf] = useState(driver.cpf ?? "");
  const [phone, setPhone] = useState(driver.phone ?? "");
  const [company, setCompany] = useState(driver.company ?? "");
  const [base, setBase] = useState(driver.base ?? "");
  const [func, setFunc] = useState(driver.role_function ?? "motorista");
  const [unlockCard, setUnlockCard] = useState(driver.unlock_card ?? "");
  const [cnh, setCnh] = useState(driver.cnh ?? "");
  const [cat, setCat] = useState(driver.cnh_category ?? "");
  const [expires, setExpires] = useState(driver.cnh_expires_at ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<{ date: string; new_expiry: string | null; note?: string }>>(
    Array.isArray(driver.cnh_renewal_history) ? driver.cnh_renewal_history : [],
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => { (async () => {
    if (driver.cnh_file_url) {
      const { data } = await supabase.storage.from("driver-docs").createSignedUrl(driver.cnh_file_url, 600);
      setPreviewUrl(data?.signedUrl ?? null);
    }
    if (driver.cnh_photo_url) {
      const { data } = await supabase.storage.from("driver-docs").createSignedUrl(driver.cnh_photo_url, 600);
      setPhotoUrl(data?.signedUrl ?? null);
    }
  })(); }, [driver.cnh_file_url, driver.cnh_photo_url]);

  const save = async () => {
    setBusy(true);
    try {
      let path = driver.cnh_file_url;
      if (file) {
        const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
        const p = `${driver.id}/cnh-${Date.now()}.${ext}`;
        const { error: e } = await supabase.storage.from("driver-docs").upload(p, file, { upsert: true });
        if (e) throw e;
        path = p;
      }
      let photoPath = driver.cnh_photo_url;
      if (photoFile) {
        const ext = (photoFile.name.split(".").pop() ?? "jpg").toLowerCase();
        const p = `${driver.id}/foto-${Date.now()}.${ext}`;
        const { error: e } = await supabase.storage.from("driver-docs").upload(p, photoFile, { upsert: true });
        if (e) throw e;
        photoPath = p;
      }
      // Auto log renewal if expiry changed
      let newHistory = history;
      if (expires && expires !== (driver.cnh_expires_at ?? "")) {
        const already = history.some((h) => h.new_expiry === expires);
        if (!already) {
          newHistory = [{ date: new Date().toISOString().slice(0, 10), new_expiry: expires, note: "Renovação registrada" }, ...history];
        }
      }
      const { error } = await supabase.from("profiles").update({
        full_name: fullName || null, cpf: cpf || null, phone: phone || null, company: company || null,
        base: base || null, role_function: (func || null) as never, unlock_card: unlockCard || null,
        cnh: cnh || null, cnh_category: cat || null, cnh_expires_at: expires || null, cnh_file_url: path,
        cnh_photo_url: photoPath, cnh_renewal_history: newHistory as never,
      }).eq("id", driver.id);
      if (error) throw error;
      toast.success("Atualizado"); onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const addManualRenewal = () => {
    const d = prompt("Data da renovação (AAAA-MM-DD):", new Date().toISOString().slice(0, 10));
    if (!d) return;
    const nx = prompt("Novo vencimento (AAAA-MM-DD):", expires || "");
    const note = prompt("Observação (opcional):", "") || undefined;
    setHistory([{ date: d, new_expiry: nx || null, note }, ...history]);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">Ficha do colaborador</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="flex items-start gap-3 pb-3 border-b border-border">
          <div className="w-24 h-32 bg-muted rounded overflow-hidden grid place-items-center shrink-0">
            {photoFile ? (
              <img src={URL.createObjectURL(photoFile)} alt="" className="w-full h-full object-cover" />
            ) : photoUrl ? (
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 space-y-1">
            <Label className="text-xs flex items-center gap-1"><Camera className="size-3" />Foto do motorista (conforme CNH)</Label>
            <Input type="file" accept="image/*" capture="user" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            <p className="text-[10px] text-muted-foreground">Use a câmera ou selecione uma imagem.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="md:col-span-3"><Label className="text-xs">Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div><Label className="text-xs">CPF</Label><Input value={cpf} onChange={(e) => setCpf(e.target.value)} /></div>
          <div><Label className="text-xs">Telefone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div><Label className="text-xs">Empresa</Label><Input value={company} onChange={(e) => setCompany(e.target.value)} /></div>
          <div><Label className="text-xs">Base</Label><Input value={base} onChange={(e) => setBase(e.target.value)} /></div>
          <div><Label className="text-xs">Função</Label>
            <select value={func} onChange={(e) => setFunc(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              {FUNCTIONS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Cartão de desbloqueio</Label><Input value={unlockCard} onChange={(e) => setUnlockCard(e.target.value)} /></div>
          <div className="md:col-span-2"><Label className="text-xs">Nº CNH</Label><Input value={cnh} onChange={(e) => setCnh(e.target.value)} /></div>
          <div><Label className="text-xs">Categoria</Label>
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">—</option>{["A","B","AB","C","D","E","AC","AD","AE"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Vencimento CNH</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <Label className="text-xs flex items-center gap-1"><Upload className="size-3" />Anexar CNH</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {previewUrl && !file && <a href={previewUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1"><FileText className="size-3" />Ver CNH anexada</a>}
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1"><History className="size-3" />Histórico de renovações da CNH</Label>
            <Button type="button" size="sm" variant="outline" onClick={addManualRenewal}><Plus className="size-3" />Registrar</Button>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma renovação registrada. Alterar o vencimento acima cria um registro automaticamente.</p>
          ) : (
            <ul className="text-xs space-y-1 max-h-32 overflow-auto">
              {history.map((h, i) => (
                <li key={i} className="flex justify-between gap-2 p-2 bg-muted/40 rounded">
                  <span><strong>{h.date}</strong>{h.new_expiry && <> → vence em <strong>{h.new_expiry}</strong></>}{h.note && <span className="text-muted-foreground"> • {h.note}</span>}</span>
                  <button type="button" onClick={() => setHistory(history.filter((_, j) => j !== i))} className="text-destructive"><XIcon className="size-3" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? "..." : "Salvar"}</Button>
        </div>
      </Card>
    </div>
  );
}