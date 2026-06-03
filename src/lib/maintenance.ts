import type { Database } from "@/integrations/supabase/types";

export type MaintenanceStatus = Database["public"]["Enums"]["maintenance_status"];

export const STATUS_OPTIONS: { value: MaintenanceStatus; label: string; tone: string }[] = [
  { value: "aberta", label: "Aberta", tone: "bg-slate-500/10 text-slate-600" },
  { value: "pendente", label: "Pendente", tone: "bg-amber-500/10 text-amber-600" },
  { value: "em_analise", label: "Em análise", tone: "bg-sky-500/10 text-sky-600" },
  { value: "orcando_mao_obra", label: "Orçando mão de obra", tone: "bg-indigo-500/10 text-indigo-600" },
  { value: "orcando_pecas", label: "Orçando peças", tone: "bg-indigo-500/10 text-indigo-600" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação", tone: "bg-yellow-500/10 text-yellow-600" },
  { value: "aguardando_pecas", label: "Aguardando peças", tone: "bg-orange-500/10 text-orange-600" },
  { value: "em_execucao", label: "Em execução", tone: "bg-blue-500/10 text-blue-600" },
  { value: "em_manutencao", label: "Em manutenção", tone: "bg-blue-500/10 text-blue-600" },
  { value: "teste_final", label: "Teste final", tone: "bg-purple-500/10 text-purple-600" },
  { value: "finalizada", label: "Finalizada", tone: "bg-green-500/10 text-green-600" },
  { value: "solucionado", label: "Solucionado", tone: "bg-green-500/10 text-green-600" },
  { value: "cancelada", label: "Cancelada", tone: "bg-rose-500/10 text-rose-600" },
];

export const statusLabel = (s: string): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

export const statusTone = (s: string): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.tone ?? "bg-muted text-muted-foreground";

export const NEEDS_LABOR_BUDGET = (s: string) => s === "orcando_mao_obra";
export const NEEDS_PARTS_BUDGET = (s: string) => s === "orcando_pecas";
export const IS_DONE_STATUS = (s: string) => s === "finalizada" || s === "solucionado";