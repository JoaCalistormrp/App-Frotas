import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_DONE_STATUS, IS_STOPPED_STATUS, STAGES, stageIndex, statusLabel, statusTone } from "@/lib/maintenance";

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded whitespace-nowrap", statusTone(status), className)}>
      {statusLabel(status)}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  return (
    <span
      title={type === "SMV" ? "Manutenção externa (oficina)" : "Manutenção interna"}
      className="inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border border-border bg-secondary text-secondary-foreground"
    >
      {type}
    </span>
  );
}

function stageState(i: number, status: string) {
  const idx = stageIndex(status);
  if (i < idx || (i === idx && IS_DONE_STATUS(status))) return "done" as const;
  if (i === idx) return IS_STOPPED_STATUS(status) ? ("stopped" as const) : ("current" as const);
  return "todo" as const;
}

// Barra compacta de 5 segmentos para cartões de lista
export function StageProgress({ status }: { status: string }) {
  const idx = stageIndex(status);
  const label = IS_STOPPED_STATUS(status) ? statusLabel(status) : STAGES[idx]?.label ?? "—";
  return (
    <div className="flex items-center gap-2 min-w-0" aria-label={`Etapa ${idx + 1} de ${STAGES.length}: ${label}`}>
      <div className="flex gap-0.5 w-24 shrink-0">
        {STAGES.map((s, i) => {
          const st = stageState(i, status);
          return (
            <span
              key={s.key}
              className={cn(
                "h-1.5 flex-1 rounded-full",
                st === "done" && "bg-green-500",
                st === "current" && "bg-primary",
                st === "stopped" && "bg-rose-500",
                st === "todo" && "bg-muted",
              )}
            />
          );
        })}
      </div>
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
    </div>
  );
}

// Indicador de etapas completo para a ficha da OS
export function StageStepper({ status }: { status: string }) {
  const idx = stageIndex(status);
  return (
    <ol className="grid grid-cols-5">
      {STAGES.map((s, i) => {
        const st = stageState(i, status);
        const label = st === "stopped" ? statusLabel(status) : s.label;
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-1 text-center min-w-0" aria-current={st === "current" ? "step" : undefined}>
            {i > 0 && (
              <span aria-hidden className={cn("absolute top-3 right-1/2 w-full h-0.5", i <= idx ? "bg-green-500/70" : "bg-muted")} />
            )}
            <span
              className={cn(
                "relative z-10 size-6 rounded-full grid place-items-center text-[11px] font-bold border-2",
                st === "done" && "bg-green-500 border-green-500 text-white",
                st === "current" && "bg-background border-primary text-primary ring-4 ring-primary/15",
                st === "stopped" && "bg-rose-500 border-rose-500 text-white",
                st === "todo" && "bg-background border-border text-muted-foreground",
              )}
            >
              {st === "done" ? <Check className="size-3.5" /> : st === "stopped" ? <X className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("text-[10px] sm:text-[11px] leading-tight w-full truncate px-0.5", st === "todo" ? "text-muted-foreground" : "font-semibold")}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
