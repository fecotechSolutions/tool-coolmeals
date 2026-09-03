import Link from "next/link";
import { DEMO_MODE } from "@/data/repository";
import { APP_ENV, APP_ENV_LABEL } from "@/lib/app-env";

const NAV = [
  { href: "/", label: "Dashboard", id: "dashboard" },
  { href: "/pipeline", label: "Pipeline", id: "pipeline" },
  { href: "/distribuidores", label: "Distribuidores", id: "distribuidores" },
  { href: "/comercial", label: "Config. comercial", id: "comercial" },
  // Ocultos por ahora; las rutas siguen existiendo para reactivar después.
  { href: "/muestras", label: "Muestras", id: "muestras", hidden: true },
  {
    href: "/conocimiento",
    label: "Base de conocimiento",
    id: "conocimiento",
    hidden: true,
  },
  { href: "/prompts", label: "Prompt Manager", id: "prompts", hidden: true },
] as const;

export type NavId = (typeof NAV)[number]["id"];

const ENV_HINT: Record<typeof APP_ENV, string> = {
  development:
    "Entorno DEV: probá acá primero (Supabase-dev / sandbox). No es producción.",
  staging: "Entorno STAGING / preview: pruebas online antes de PROD.",
  production: "Entorno PROD: clientes reales (WhatsApp …440).",
};

export function AppShell({
  children,
  current,
}: {
  children: React.ReactNode;
  current: NavId;
}) {
  const visibleNav = NAV.filter((item) => !("hidden" in item && item.hidden));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span className="cool">COOL</span>
            <span className="meals">MEALS</span>
          </div>
          <div className="brand-sub">Ops · panel interno</div>
        </div>

        <nav className="nav" aria-label="Módulos">
          {visibleNav.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              aria-current={current === item.id ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="env-pills">
            <span className={`env-pill env-pill--${APP_ENV}`}>
              {APP_ENV_LABEL[APP_ENV]}
            </span>
            <span className="demo-pill">
              {DEMO_MODE ? "Mocks" : "API + Supabase"}
            </span>
          </div>
          <p>
            {ENV_HINT[APP_ENV]}{" "}
            {DEMO_MODE
              ? "Datos mock locales (NEXT_PUBLIC_DEMO_MODE)."
              : "Datos vía API."}{" "}
            Estética alineada a{" "}
            <a
              href="https://www.coolmeals.com.ar/"
              target="_blank"
              rel="noreferrer"
              style={{ color: "#bbd8f9" }}
            >
              coolmeals.com.ar
            </a>
            .
          </p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <strong>Cool Meals Ops</strong>
            <span className="muted"> · MVP visual</span>
          </div>
          <div className="topbar-meta">
            <span className={`chip env-chip env-chip--${APP_ENV}`}>
              {APP_ENV_LABEL[APP_ENV]}
            </span>
            <span className="chip">superadmin</span>
            <span className="chip chip-soft">sin auth aún</span>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
