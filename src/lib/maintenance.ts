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
  { value: "aguardando_pecas", label: "Aguardando peças", tone: "bg-orange-500/10 text-orange-600" },
  { value: "em_execucao", label: "Em execução", tone: "bg-blue-500/10 text-blue-600" },
  { value: "em_manutencao", label: "Em manutenção", tone: "bg-blue-500/10 text-blue-600" },
  { value: "teste_final", label: "Teste final", tone: "bg-purple-500/10 text-purple-600" },
  { value: "finalizada", label: "Finalizada", tone: "bg-green-500/10 text-green-600" },
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

// OS que o Financeiro lista para vínculo — a partir daqui "itens trocados" é obrigatório
export const APPROVED_STATUSES: MaintenanceStatus[] = [
  "aprovada", "aguardando_pecas", "em_execucao", "em_manutencao", "teste_final", "finalizada", "solucionado",
];
export const REQUIRES_ITEMS = (s: string) => APPROVED_STATUSES.includes(s as MaintenanceStatus);

// Modelo antigo de 3 status, equivalente a aberta / em_execucao / finalizada.
// Só aparecem no seletor quando a OS já está num deles.
export const LEGACY_STATUSES: MaintenanceStatus[] = ["pendente", "em_manutencao", "solucionado"];

export const STAGES: { key: string; label: string; statuses: MaintenanceStatus[] }[] = [
  { key: "abertura",  label: "Abertura",  statuses: ["aberta", "pendente"] },
  { key: "orcamento", label: "Orçamento", statuses: ["em_analise", "orcando_mao_obra", "orcando_pecas"] },
  { key: "aprovacao", label: "Aprovação", statuses: ["aguardando_aprovacao", "aprovada", "negada"] },
  { key: "execucao",  label: "Execução",  statuses: ["aguardando_pecas", "em_execucao", "em_manutencao", "teste_final"] },
  { key: "conclusao", label: "Concluída", statuses: ["finalizada", "solucionado", "cancelada"] },
];

export const stageIndex = (s: string): number =>
  STAGES.findIndex((st) => st.statuses.includes(s as MaintenanceStatus));

// Atalhos de "próximo passo": o primeiro é o caminho mais comum; o seletor completo continua disponível
export const NEXT_STEPS: Partial<Record<MaintenanceStatus, MaintenanceStatus[]>> = {
  aberta:           ["em_analise", "em_execucao", "orcando_pecas", "orcando_mao_obra"],
  pendente:         ["em_analise", "em_execucao", "orcando_pecas", "orcando_mao_obra"],
  em_analise:       ["orcando_pecas", "orcando_mao_obra", "aguardando_aprovacao", "em_execucao"],
  orcando_mao_obra: ["aguardando_aprovacao", "orcando_pecas"],
  orcando_pecas:    ["aguardando_aprovacao", "orcando_mao_obra"],
  aprovada:         ["em_execucao", "aguardando_pecas"],
  aguardando_pecas: ["em_execucao"],
  em_execucao:      ["teste_final", "aguardando_pecas", "finalizada"],
  em_manutencao:    ["teste_final", "aguardando_pecas", "finalizada"],
  teste_final:      ["finalizada", "em_execucao"],
};

const ACTION_LABELS: Partial<Record<MaintenanceStatus, string>> = {
  em_analise: "Iniciar análise",
  orcando_mao_obra: "Orçar mão de obra",
  orcando_pecas: "Orçar peças",
  aguardando_aprovacao: "Enviar para aprovação",
  aguardando_pecas: "Aguardar peças",
  em_execucao: "Iniciar execução",
  teste_final: "Ir para teste final",
  finalizada: "Finalizar OS",
};

export const actionLabel = (from: string, to: MaintenanceStatus): string => {
  if (to === "em_execucao" && from === "teste_final") return "Voltar para execução";
  if (to === "em_execucao" && from === "aguardando_pecas") return "Peças chegaram: executar";
  return ACTION_LABELS[to] ?? statusLabel(to);
};

export const statusAccent = (s: string): string => {
  if (s === "aguardando_aprovacao") return "border-l-yellow-500";
  if (IS_STOPPED_STATUS(s)) return "border-l-rose-500";
  if (IS_DONE_STATUS(s)) return "border-l-green-500";
  if (stageIndex(s) === 3) return "border-l-blue-500";
  if (stageIndex(s) === 1) return "border-l-indigo-500";
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