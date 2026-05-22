import jsPDF from "jspdf";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

let _logoCache: string | null = null;
export async function getLogoDataUrl(): Promise<string> {
  if (_logoCache) return _logoCache;
  const res = await fetch(logoTomaz);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => { _logoCache = r.result as string; resolve(_logoCache!); };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function applyPdfBranding(doc: jsPDF, title: string, subtitle?: string) {
  const logo = await getLogoDataUrl();
  const w = doc.internal.pageSize.getWidth();
  doc.addImage(logo, "PNG", 14, 8, 14, 14);
  doc.setFontSize(14); doc.setTextColor(20);
  doc.text("Grupo Tomaz", 32, 15);
  doc.setFontSize(11); doc.setTextColor(60);
  doc.text(title, 32, 21);
  if (subtitle) { doc.setFontSize(8); doc.setTextColor(120); doc.text(subtitle, 32, 26); }
  doc.setDrawColor(200); doc.line(14, 28, w - 14, 28);
  doc.setTextColor(0);
  const h = doc.internal.pageSize.getHeight();
  doc.setFontSize(7); doc.setTextColor(150);
  doc.text(`Emitido em ${new Date().toLocaleString("pt-BR")} • Grupo Tomaz`, 14, h - 6);
  doc.setTextColor(0);
}

export const BASE_CODES = [
  { code: "VOT", label: "Votorantim" },
  { code: "SRQ", label: "São Roque" },
  { code: "CDA", label: "Capela do Alto" },
  { code: "TDS", label: "Taboão da Serra" },
  { code: "PLN", label: "Paulínia" },
  { code: "MDC", label: "Mogi das Cruzes" },
  { code: "PRB", label: "Peruíbe" },
  { code: "ITR", label: "Itararé" },
  { code: "FZD", label: "Fazenda" },
  { code: "OBRA", label: "Obra" },
] as const;