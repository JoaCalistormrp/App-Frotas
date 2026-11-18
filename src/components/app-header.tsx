import { Fragment, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { breadcrumbFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

// Barra superior comum a todos os módulos: botão do menu + "onde estou"
export function AppHeader({ actions }: { actions?: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const crumbs = breadcrumbFor(path);
  const last = crumbs.length - 1;

  return (
    <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border bg-card/80 px-2 backdrop-blur">
      <SidebarTrigger aria-label="Abrir ou recolher o menu" />
      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
      <nav aria-label="Localização" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((c, i) => (
          <Fragment key={`${c}-${i}`}>
            {i > 0 && (
              <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-muted-foreground/50", i === 1 && last > 1 && "max-sm:hidden")} />
            )}
            <span
              aria-current={i === last ? "page" : undefined}
              className={cn(
                "truncate",
                i === last ? "font-semibold text-foreground" : "text-muted-foreground",
                i === 0 && last > 1 && "max-sm:hidden",
              )}
            >
              {c}
            </span>
          </Fragment>
        ))}
      </nav>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
