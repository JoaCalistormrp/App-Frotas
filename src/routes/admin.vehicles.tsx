import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Truck, Plus, FileText, X as XIcon, Upload, Trash2, Pencil, SlidersHorizontal } from "lucide-react";

export const Route = createFileRoute("/admin/vehicles")({ component: VehiclesPage });

type Vehicle = {
  id: string; plate: string; model: string | null; brand: string | null; year: number | null;
  renavam: string | null; vehicle_type: string; category: string | null; base: string | null;
  sector: string | null; active: boolean; mileage: number | null; fuel_type: string | null; document_url: string | null;
};

const CATEGORIES = [
  { value: "pesado", label: "Pesados" },
  { value: "operacional", label: "Operacional" },
  { value: "administrativo", label: "Administrativo" },
];

function VehiclesPage() {
  const [list, setList] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [baseFilter, setBaseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all"|"active"|"inactive">("all");
  const [showFilter, setShowFilter] = useState(false);
  const [editing, setEditing] = useState<Vehicle | "new" | null>(null);

  const activeFilterCount = [search, catFilter, baseFilter, statusFilter !== "all" ? statusFilter : ""].filter(Boolean).length;

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("vehicles").select("*").order("plate");
    setList((data ?? []) as unknown as Vehicle[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = list.filter((v) => {
    if (search && !`${v.plate} ${v.model ?? ""} ${v.brand ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (catFilter && v.category !== catFilter) return false;
    if (baseFilter && !(v.base ?? "").toLowerCase().includes(baseFilter.toLowerCase())) return false;
    if (statusFilter === "active" && !v.active) return false;
    if (statusFilter === "inactive" && v.active) return false;
    return true;
  });

  const remove = async (v: Vehicle) => {
    if (!confirm(`Excluir veículo ${v.plate}?`)) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); load(); }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="size-6" />Veículos</h1>
          <p className="text-sm text-muted-foreground">Cadastro, categorias e documentos da frota</p>
        </div>
        <div className="flex gap-2">
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
          <Button onClick={() => setEditing("new")}><Plus className="size-4" />Novo veículo</Button>
        </div>
      </div>

      {showFilter && (
        <Card className="p-4 grid grid-cols-2 md:grid-cols-4 gap-2 border-dashed border-primary/30 bg-primary/[0.02]">
          <div><Label className="text-xs">Placa / modelo / marca</Label><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." /></div>
          <div><Label className="text-xs">Categoria</Label>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">Todas</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Base</Label><Input value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)} /></div>
          <div><Label className="text-xs">Situação</Label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option>
            </select>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="text-sm font-semibold mb-2">{filtered.length} veículo(s)</div>
        {loading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        <div className="divide-y divide-border">
          {filtered.map((v) => (
            <div key={v.id} className="py-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-2">
                  {v.plate}
                  {v.category && <span className="text-[10px] uppercase bg-primary/10 text-primary px-2 py-0.5 rounded">{CATEGORIES.find((c) => c.value === v.category)?.label ?? v.category}</span>}
                  {!v.active && <span className="text-[10px] uppercase bg-muted text-muted-foreground px-2 py-0.5 rounded">Inativo</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[v.brand, v.model, v.year].filter(Boolean).join(" • ") || "—"}
                  {v.base ? ` • ${v.base}` : ""}{v.mileage ? ` • ${v.mileage} km` : ""}{v.fuel_type ? ` • ${v.fuel_type}` : ""}
                </div>
              </div>
              {v.document_url && <FileText className="size-4 text-primary shrink-0" />}
              <Button size="icon" variant="ghost" onClick={() => setEditing(v)}><Pencil className="size-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(v)}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          {!loading && filtered.length === 0 && <div className="text-sm text-muted-foreground py-4">Nenhum veículo.</div>}
        </div>
      </Card>

      {editing && <VehicleModal vehicle={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function VehicleModal({ vehicle, onClose, onSaved }: { vehicle: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const [plate, setPlate] = useState(vehicle?.plate ?? "");
  const [brand, setBrand] = useState(vehicle?.brand ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [year, setYear] = useState(vehicle?.year?.toString() ?? "");
  const [renavam, setRenavam] = useState(vehicle?.renavam ?? "");
  const [category, setCategory] = useState<string>(vehicle?.category ?? "");
  const [type, setType] = useState<string>(vehicle?.vehicle_type ?? "PESADOS");
  const [base, setBase] = useState(vehicle?.base ?? "");
  const [mileage, setMileage] = useState(vehicle?.mileage?.toString() ?? "");
  const [fuel, setFuel] = useState(vehicle?.fuel_type ?? "");
  const [active, setActive] = useState(vehicle?.active ?? true);
  const [file, setFile] = useState<File | null>(null);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (vehicle?.document_url) {
        const { data } = await supabase.storage.from("vehicle-docs").createSignedUrl(vehicle.document_url, 600);
        setDocUrl(data?.signedUrl ?? null);
      }
    })();
  }, [vehicle?.document_url]);

  const save = async () => {
    if (!plate.trim()) return toast.error("Informe a placa");
    setBusy(true);
    try {
      let path = vehicle?.document_url ?? null;
      const id = vehicle?.id;
      if (file && id) {
        const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
        const p = `${id}/doc-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("vehicle-docs").upload(p, file, { upsert: true });
        if (upErr) throw upErr;
        path = p;
      }
      const payload = {
        plate: plate.toUpperCase().trim(),
        brand: brand || null, model: model || null,
        year: year ? Number(year) : null,
        renavam: renavam || null,
        category: (category || null) as never,
        vehicle_type: type as never,
        base: base || null,
        mileage: mileage ? Number(mileage) : null,
        fuel_type: fuel || null,
        document_url: path, active,
      };
      if (vehicle) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicle.id);
        if (error) throw error;
        if (file && !id) {/* unreachable */}
      } else {
        const { data: ins, error } = await supabase.from("vehicles").insert(payload).select("id").single();
        if (error) throw error;
        if (file && ins?.id) {
          const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase();
          const p = `${ins.id}/doc-${Date.now()}.${ext}`;
          const { error: upErr } = await supabase.storage.from("vehicle-docs").upload(p, file, { upsert: true });
          if (!upErr) await supabase.from("vehicles").update({ document_url: p }).eq("id", ins.id);
        }
      }
      toast.success(vehicle ? "Atualizado" : "Cadastrado");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" onClick={onClose}>
      <Card className="w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">{vehicle ? "Editar veículo" : "Novo veículo"}</h3>
          <Button size="icon" variant="ghost" onClick={onClose}><XIcon className="size-4" /></Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div><Label className="text-xs">Placa *</Label><Input value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
          <div><Label className="text-xs">Marca</Label><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></div>
          <div><Label className="text-xs">Modelo</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
          <div><Label className="text-xs">Ano</Label><Input type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          <div><Label className="text-xs">RENAVAM</Label><Input value={renavam} onChange={(e) => setRenavam(e.target.value)} /></div>
          <div><Label className="text-xs">Quilometragem</Label><Input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} /></div>
          <div><Label className="text-xs">Categoria</Label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div><Label className="text-xs">Tipo (checklist)</Label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="PESADOS">Pesados</option><option value="OPERACIONAIS">Operacionais</option>
              <option value="CESTO_AEREO">Cesto Aéreo</option><option value="ADMINISTRATIVO">Administrativo</option>
              <option value="MUNCK">Munck</option>
            </select>
          </div>
          <div><Label className="text-xs">Combustível</Label>
            <select value={fuel} onChange={(e) => setFuel(e.target.value)} className="w-full h-10 rounded-md bg-input border border-border px-3 text-sm">
              <option value="">—</option><option value="Diesel">Diesel</option><option value="Gasolina">Gasolina</option>
              <option value="Etanol">Etanol</option><option value="Flex">Flex</option><option value="GNV">GNV</option><option value="Elétrico">Elétrico</option>
            </select>
          </div>
          <div><Label className="text-xs">Base</Label><Input value={base} onChange={(e) => setBase(e.target.value)} /></div>
          <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativo</label></div>
        </div>
        <div className="pt-2 border-t border-border space-y-2">
          <Label className="text-xs flex items-center gap-1"><Upload className="size-3" />Anexar documento (CRLV / contrato)</Label>
          <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {docUrl && !file && <a href={docUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1"><FileText className="size-3" />Ver documento anexado</a>}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={save} disabled={busy}>{busy ? "..." : "Salvar"}</Button>
        </div>
      </Card>
    </div>
  );
}