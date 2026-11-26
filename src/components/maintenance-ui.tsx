import { Check, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IS_DONE_STATUS, IS_STOPPED_STATUS, IS_WAITING_PART, OS_KIND_LABEL, stageIndex, stagesFor, statusLabelFor, statusTone, type OsKind } from "@/lib/maintenance";

export function StatusBadge({ status, kind = "SMI", className }: { status: string; kind?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded whitespace-nowrap", statusTone(status), className)}>
      {statusLabelFor(kind, status)}
    </span>
  );
}

export function TypeBadge({ type }: { type: string }) {
  const external = type === "SMV";
  return (
    <span
      title={external ? "Oficina externa" : "Oficina Grupo Tomaz"}
      className={cn(
        "inline-flex items-center text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
        external ? "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300" : "border-border bg-secondary text-secondary-foreground",
      )}
    >
      {OS_KIND_LABEL[(external ? "SMV" : "SMI") as OsKind]}
    </span>
  );
}

type State = "done" | "current" | "paused" | "stopped" | "todo";

function stageState(i: number, status: string, kind: string): State {
  const idx = stageIndex(status, kind);
  if (i < idx || (i === idx && IS_DONE_STATUS(status))) return "done";
  if (i === idx) return IS_STOPPED_STATUS(status) ? "stopped" : IS_WAITING_PART(status) ? "paused" : "current";
  return "todo";
}

const SEGMENT: Record<State, string> = {
  done: "bg-green-500", current: "bg-primary", paused: "bg-amber-500", stopped: "bg-rose-500", todo: "bg-muted",
};

// Barra compacta para cartões de lista
export function StageProgress({ status, kind = "SMI" }: { status: string; kind?: string }) {
  const stages = stagesFor(kind);
  const idx = stageIndex(status, kind);
  const label = IS_STOPPED_STATUS(status) || IS_WAITING_PART(status) ? statusLabelFor(kind, status) : stages[idx]?.label ?? "—";
  return (
    <div className="flex items-center gap-2 min-w-0" aria-label={`Etapa ${idx + 1} de ${stages.length}: ${label}`}>
      <div className="flex gap-0.5 w-20 shrink-0">
        {stages.map((s, i) => <span key={s.key} className={cn("h-1.5 flex-1 rounded-full", SEGMENT[stageState(i, status, kind)])} />)}
      </div>
      <span className="text-[11px] text-muted-foreground truncate">{label}</span>
    </div>
  );
}

// Indicador de etapas da ficha da OS
export function StageStepper({ status, kind = "SMI" }: { status: string; kind?: string }) {
  const stages = stagesFor(kind);
  const idx = stageIndex(status, kind);
  return (
    <ol className="grid" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
      {stages.map((s, i) => {
        const st = stageState(i, status, kind);
        const label = st === "stopped" || st === "paused" ? statusLabelFor(kind, status) : s.label;
        return (
          <li key={s.key} className="relative flex flex-col items-center gap-1 text-center min-w-0" aria-current={st === "current" || st === "paused" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={cn("absolute top-3 right-1/2 w-full h-0.5", i <= idx ? "bg-green-500/70" : "bg-muted")} />}
            <span
              className={cn(
                "relative z-10 size-6 rounded-full grid place-items-center text-[11px] font-bold border-2",
                st === "done" && "bg-green-500 border-green-500 text-white",
                st === "current" && "bg-background border-primary text-primary ring-4 ring-primary/15",
                st === "paused" && "bg-amber-500 border-amber-500 text-white ring-4 ring-amber-500/20",
                st === "stopped" && "bg-rose-500 border-rose-500 text-white",
                st === "todo" && "bg-background border-border text-muted-foreground",
              )}
            >
              {st === "done" ? <Check className="size-3.5" /> : st === "stopped" ? <X className="size-3.5" /> : st === "paused" ? <Package className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("text-[10px] sm:text-[11px] leading-tight w-full truncate px-0.5", st === "todo" ? "text-muted-foreground" : "font-semibold")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
