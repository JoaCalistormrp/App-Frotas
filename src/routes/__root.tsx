import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { SidebarProvider } from "@/components/ui/sidebar";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Frotas Grupo Tomaz" },
      { name: "theme-color", content: "#1a1a4d" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Tomaz Checklist" },
      { name: "description", content: "Fleet Check Pro digitizes vehicle inspections for fleet management, operational control, and reporting." },
      { name: "author", content: "Grupo Tomaz" },
      { property: "og:title", content: "Grupo Tomaz ERP" },
      { property: "og:description", content: "Sistema ERP do Grupo Tomaz — gestão de frotas, checklists e operações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@GrupoTomaz" },
      { name: "twitter:title", content: "Grupo Tomaz ERP" },
      { name: "twitter:description", content: "Sistema ERP do Grupo Tomaz — gestão de frotas, checklists e operações." },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icons/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icons/icon-512.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const isLogin = useRouterState({ select: (s) => s.location.pathname === "/" });

  return (
    <AuthProvider>
      {isLogin ? (
        <>
          <Outlet />
          <Toaster richColors position="top-center" />
        </>
      ) : (
        <SidebarProvider>
          <Outlet />
          <Toaster richColors position="top-center" />
        </SidebarProvider>
      )}
    </AuthProvider>
  );
}
