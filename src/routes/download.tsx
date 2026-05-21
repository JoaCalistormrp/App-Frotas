import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, Monitor, Apple, Chrome, Share2, Plus, ArrowLeft } from "lucide-react";
import logoTomaz from "@/assets/grupo-tomaz-logo.png";

export const Route = createFileRoute("/download")({
  component: DownloadPage,
  head: () => ({
    meta: [
      { title: "Baixar app - Checklist Frota Grupo Tomaz" },
      { name: "description", content: "Instale o aplicativo Checklist Frota do Grupo Tomaz no seu celular ou computador." },
    ],
  }),
});

type Platform = "android" | "ios" | "desktop" | "unknown";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "desktop";
}

function DownloadPage() {
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt as any);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia?.("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt as any);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Voltar
        </Link>

        <div className="flex flex-col items-center text-center gap-3">
          <img src={logoTomaz} alt="Grupo Tomaz" className="h-20 w-auto object-contain" />
          <h1 className="text-2xl font-bold">Baixar o aplicativo</h1>
          <p className="text-sm text-muted-foreground max-w-md">
            Instale o Checklist Frota no seu dispositivo para acesso rápido, com ícone na tela inicial e modo tela cheia.
          </p>
        </div>

        {installed && (
          <Card className="p-4 bg-primary/5 border-primary/30 text-center text-sm">
            ✅ Aplicativo já instalado neste dispositivo.
          </Card>
        )}

        {installEvent && !installed && (
          <Card className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="size-5 text-primary" />
              <h2 className="font-semibold">Instalação rápida disponível</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Seu navegador suporta a instalação direta. Clique no botão abaixo.
            </p>
            <Button onClick={handleInstall} className="w-full h-11">
              <Download className="size-4 mr-2" /> Instalar agora
            </Button>
          </Card>
        )}

        <Card className={`p-5 space-y-3 ${platform === "android" ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center gap-2">
            <Smartphone className="size-5 text-primary" />
            <h2 className="font-semibold">Android (Chrome)</h2>
          </div>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Abra esta página no <strong>Google Chrome</strong>.</li>
            <li>Toque no menu <strong>⋮</strong> (três pontinhos) no canto superior direito.</li>
            <li>Selecione <strong>"Instalar app"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</li>
            <li>Confirme. O ícone aparecerá na tela inicial.</li>
          </ol>
        </Card>

        <Card className={`p-5 space-y-3 ${platform === "ios" ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center gap-2">
            <Apple className="size-5 text-primary" />
            <h2 className="font-semibold">iPhone / iPad (Safari)</h2>
          </div>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Abra esta página no <strong>Safari</strong> (não funciona no Chrome do iOS).</li>
            <li>Toque no botão <Share2 className="inline size-4" /> <strong>Compartilhar</strong> na barra inferior.</li>
            <li>Role e selecione <Plus className="inline size-4" /> <strong>"Adicionar à Tela de Início"</strong>.</li>
            <li>Toque em <strong>Adicionar</strong>. Pronto.</li>
          </ol>
        </Card>

        <Card className={`p-5 space-y-3 ${platform === "desktop" ? "ring-2 ring-primary" : ""}`}>
          <div className="flex items-center gap-2">
            <Monitor className="size-5 text-primary" />
            <h2 className="font-semibold">Computador (Windows / Mac / Linux)</h2>
          </div>
          <ol className="text-sm space-y-2 list-decimal list-inside text-muted-foreground">
            <li>Abra no <Chrome className="inline size-4" /> <strong>Google Chrome</strong> ou <strong>Microsoft Edge</strong>.</li>
            <li>Clique no ícone de <strong>instalação</strong> <Download className="inline size-4" /> que aparece à direita da barra de endereço.</li>
            <li>Ou abra o menu <strong>⋮</strong> → <strong>"Instalar Checklist Frota..."</strong>.</li>
            <li>O app abrirá em uma janela própria, como um programa nativo.</li>
          </ol>
        </Card>

        <Card className="p-4 text-xs text-muted-foreground text-center">
          Dica: depois de instalado, o aplicativo funciona pelo ícone como qualquer outro app, sem precisar abrir o navegador.
        </Card>
      </div>
    </div>
  );
}