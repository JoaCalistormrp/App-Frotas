export type MaintenanceStatus =
  | "pendente"
  | "aprovada"
  | "negada"
  | "em_manutencao"
  | "solucionado"
  | "aberta"
  | "em_analise"
  | "orcando_mao_obra"
  | "orcando_pecas"
  | "aguardando_aprovacao"
  | "aguardando_pecas"
  | "em_execucao"
  | "teste_final"
  | "finalizada"
  | "cancelada";

export const FINAL_STATUSES = ["finalizada", "solucionado", "negada", "cancelada"] as const;

export const STATUS_OPTIONS: { value: MaintenanceStatus; label: string; tone: string }[] = [
  { value: "aberta", label: "Aberta", tone: "bg-slate-500/10 text-slate-600" },
  { value: "pendente", label: "Pendente", tone: "bg-amber-500/10 text-amber-600" },
  { value: "em_analise", label: "Em análise", tone: "bg-sky-500/10 text-sky-600" },
  { value: "orcando_mao_obra", label: "Orçando mão de obra", tone: "bg-indigo-500/10 text-indigo-600" },
  { value: "orcando_pecas", label: "Orçando peças", tone: "bg-indigo-500/10 text-indigo-600" },
  { value: "aguardando_aprovacao", label: "Aguardando aprovação", tone: "bg-yellow-500/10 text-yellow-600" },
  { value: "aprovada", label: "Aprovada", tone: "bg-emerald-500/10 text-emerald-600" },
  { value: "aguardando_pecas", label: "Aguardando peça", tone: "bg-amber-500/15 text-amber-700" },
  { value: "em_execucao", label: "Em execução", tone: "bg-blue-500/10 text-blue-600" },
  { value: "em_manutencao", label: "Em manutenção", tone: "bg-blue-500/10 text-blue-600" },
  { value: "teste_final", label: "Teste final", tone: "bg-purple-500/10 text-purple-600" },
  { value: "finalizada", label: "Concluída", tone: "bg-green-500/10 text-green-600" },
  { value: "solucionado", label: "Solucionado", tone: "bg-green-500/10 text-green-600" },
  { value: "negada", label: "OS negada", tone: "bg-rose-500/10 text-rose-600" },
  { value: "cancelada", label: "Cancelada", tone: "bg-rose-500/10 text-rose-600" },
];

export const statusLabel = (s: string): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;

export const statusTone = (s: string): string =>
  STATUS_OPTIONS.find((o) => o.value === s)?.tone ?? "bg-muted text-muted-foreground";

export const NEEDS_LABOR_BUDGET = (s: string) => s === "orcando_mao_obra";
export const NEEDS_PARTS_BUDGET = (s: string) => s === "orcando_pecas";
export const IS_DONE_STATUS = (s: string) => s === "finalizada" || s === "solucionado";
export const IS_STOPPED_STATUS = (s: string) => s === "negada" || s === "cancelada";

export const OPEN_STATUSES: MaintenanceStatus[] = [
  "aberta", "pendente", "em_analise", "orcando_mao_obra", "orcando_pecas", "aguardando_aprovacao",
  "aprovada", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final",
];
export const DONE_STATUSES: MaintenanceStatus[] = ["finalizada", "solucionado"];

// OS que o Financeiro lista para vínculo
export const APPROVED_STATUSES: MaintenanceStatus[] = [
  "aprovada", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final", "finalizada", "solucionado",
];
// Peças/serviço realizado são exigidos ao concluir a OS interna
export const REQUIRES_ITEMS = (s: string) => IS_DONE_STATUS(s);

// Modelo antigo de 3 status, equivalente a aberta / em_execucao / finalizada.
export const LEGACY_STATUSES: MaintenanceStatus[] = ["pendente", "em_manutencao", "solucionado"];

export type OsKind = "SMI" | "SMV";
export const OS_KIND_LABEL: Record<OsKind, string> = { SMI: "OS interna", SMV: "OS externa" };

type Stage = { key: string; label: string; statuses: MaintenanceStatus[] };
const OPEN_EXCEPT_EXEC: MaintenanceStatus[] = ["aberta", "pendente", "em_analise", "orcando_mao_obra", "orcando_pecas", "aguardando_aprovacao", "aprovada"];
const EXEC: MaintenanceStatus[] = ["em_execucao", "em_manutencao", "teste_final", "aguardando_pecas"];
const CLOSED: MaintenanceStatus[] = ["finalizada", "solucionado", "cancelada", "negada"];

// Interna: oficina Grupo Tomaz; "aguardando peça" é uma pausa dentro da execução
export const INTERNAL_STAGES: Stage[] = [
  { key: "aberta", label: "Aberta", statuses: OPEN_EXCEPT_EXEC },
  { key: "execucao", label: "Em execução", statuses: EXEC },
  { key: "concluida", label: "Concluída", statuses: CLOSED },
];
export const EXTERNAL_STAGES: Stage[] = [
  { key: "oficina", label: "Na oficina", statuses: [...OPEN_EXCEPT_EXEC, ...EXEC] },
  { key: "concluida", label: "Concluída", statuses: CLOSED },
];
export const stagesFor = (kind: string) => (kind === "SMV" ? EXTERNAL_STAGES : INTERNAL_STAGES);
export const stageIndex = (s: string, kind: string = "SMI"): number =>
  stagesFor(kind).findIndex((st) => st.statuses.includes(s as MaintenanceStatus));

// Rótulo conforme o tipo: na externa, "aberta" significa que o veículo está na oficina
export const statusLabelFor = (kind: string, s: string): string =>
  kind === "SMV" && OPEN_STATUSES.includes(s as MaintenanceStatus) ? "Na oficina" : statusLabel(s);

export const IS_WAITING_PART = (s: string) => s === "aguardando_pecas";

export const statusAccent = (s: string): string => {
  if (IS_WAITING_PART(s)) return "border-l-amber-500";
  if (IS_STOPPED_STATUS(s)) return "border-l-rose-500";
  if (IS_DONE_STATUS(s)) return "border-l-green-500";
  if (EXEC.includes(s as MaintenanceStatus)) return "border-l-blue-500";
  return "border-l-slate-400";
};

const RELATIVE = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
export function timeAgo(iso: string): string {
  const diffMin = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(diffMin) < 60) return RELATIVE.format(diffMin, "minute");
  const diffH = Math.round(diffMin / 60);
  if (Math.abs(diffH) < 24) return RELATIVE.format(diffH, "hour");
  const diffD = Math.round(diffH / 24);
  if (Math.abs(diffD) < 30) return RELATIVE.format(diffD, "day");
  return new Date(iso).toLocaleDateString("pt-BR");
}