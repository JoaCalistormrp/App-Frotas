import type { LucideIcon } from "lucide-react";
import {
  CalendarDays, Car, FilePlus, Gavel, History, LayoutDashboard, ShieldCheck, Trash2, TrendingDown, Users, Wrench,
} from "lucide-react";

export type NavPage = { title: string; url: string; icon: LucideIcon; slug: string; exact?: boolean };
export type NavGroup = { label: string | null; pages: NavPage[] };
export type NavModule = { title: string; url: string; icon: LucideIcon; slug: string; adminBypass?: boolean };

// Páginas de Frotas agrupadas pelo objeto com que o usuário trabalha
export const FROTAS_GROUPS: NavGroup[] = [
  { label: null, pages: [{ title: "Dashboard", url: "/admin", icon: LayoutDashboard, slug: "frotas.dashboard", exact: true }] },
  {
    label: "Checklists",
    pages: [
      { title: "Abrir checklist", url: "/admin/checklist", icon: FilePlus, slug: "frotas.checklist_new", exact: true },
      { title: "Histórico", url: "/admin/checklists", icon: History, slug: "frotas.checklists" },
    ],
  },
  {
    label: "Manutenção",
    pages: [
      { title: "Ordens de serviço", url: "/admin/maintenance", icon: Wrench, slug: "frotas.manutencao" },
      { title: "Lixeira de OS", url: "/admin/maintenance/trash", icon: Trash2, slug: "frotas.lixeira" },
    ],
  },
  {
    label: "Frota",
    pages: [
      { title: "Veículos", url: "/admin/vehicles", icon: Car, slug: "frotas.veiculos" },
      { title: "Motoristas", url: "/admin/drivers", icon: Users, slug: "frotas.motoristas" },
      { title: "Agendamento", url: "/admin/agendamento", icon: CalendarDays, slug: "frotas.agendamento" },
    ],
  },
];

export const OTHER_MODULES: NavModule[] = [
  { title: "Financeiro Frotas", url: "/financeiro", icon: TrendingDown, slug: "financeiro" },
  { title: "Licitações", url: "/licitacao", icon: Gavel, slug: "licitacao", adminBypass: true },
  { title: "Usuários", url: "/admin/usuarios", icon: ShieldCheck, slug: "utilizadores" },
];

export const ALL_FROTAS_PAGES = FROTAS_GROUPS.flatMap((g) => g.pages);

export const hasFrotasModule = (modules: string[]) => modules.some((m) => m === "frotas" || m.startsWith("frotas."));

// Mesma regra das rotas: o módulo legado "frotas" libera tudo e ".readonly" é a única subpermissão de tela.
// Os tipos de checklist (frotas.checklists.pesados…) pertencem a "Abrir checklist" e não liberam o Histórico.
export const canAccessPage = (modules: string[], slug: string) =>
  modules.includes("frotas") || modules.includes(slug) || modules.includes(`${slug}.readonly`);

export const canSeeModule = (mod: NavModule, modules: string[], isAdmin: boolean) =>
  (mod.adminBypass && isAdmin) || modules.includes(mod.slug);

const matches = (path: string, url: string, exact?: boolean) =>
  exact ? path === url || path === url + "/" : path === url || path.startsWith(url + "/");

// A URL mais longa vence: /admin/maintenance/trash é "Lixeira", não "Ordens de serviço"
export function findActiveFrotasPage(path: string): NavPage | null {
  let best: NavPage | null = null;
  for (const p of ALL_FROTAS_PAGES) {
    if (matches(path, p.url, p.exact) && (!best || p.url.length > best.url.length)) best = p;
  }
  return best;
}

export function breadcrumbFor(path: string): string[] {
  if (path === "/home") return ["Início"];
  if (path.startsWith("/motorista")) return ["Checklist diário"];
  const other = OTHER_MODULES.find((m) => matches(path, m.url));
  if (other) return [other.title];
  const page = findActiveFrotasPage(path);
  if (page) {
    const crumbs = ["Frotas", page.title];
    if (page.url === "/admin/maintenance" && path.replace(/\/$/, "") !== page.url) {
      crumbs.push(path.endsWith("/new") ? "Nova OS" : "Detalhe da OS");
    }
    return crumbs;
  }
  return path.startsWith("/admin") ? ["Frotas"] : [];
}

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

// "JOAO VITOR NARDINI CALISTO - VOTORANTIM" -> "Joao Vitor Nardini Calisto"
export function prettyName(full: string | null | undefined): string | null {
  const base = full?.split(" - ")[0]?.trim();
  if (!base) return null;
  return base
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? "").split(/\s+/).filter((w) => w && !LOWER_WORDS.has(w.toLowerCase()));
  if (!words.length) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}
