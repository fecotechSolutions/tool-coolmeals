import Link from "next/link";
import { DEMO_MODE } from "@/data/repository";

const NAV = [
  { href: "/", label: "Dashboard", id: "dashboard" },
  { href: "/pipeline", label: "Pipeline", id: "pipeline" },
  { href: "/distribuidores", label: "Distribuidores", id: "distribuidores" },
  { href: "/comercial", label: "Config. comercial", id: "comercial" },
  { href: "/muestras", label: "Muestras", id: "muestras" },
  { href: "/conocimiento", label: "Base de conocimiento", id: "conocimiento" },
  { href: "/prompts", label: "Prompt Manager", id: "prompts" },
] as const;

export type NavId = (typeof NAV)[number]["id"];

export function AppShell({
  children,
  current,
}: {
  children: React.ReactNode;
  current: NavId;
}) {
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
          {NAV.map((item) => (
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
          <span className="demo-pill">{DEMO_MODE ? "Modo demo" : "API + Supabase"}</span>
          <p>
            {DEMO_MODE
              ? "Datos mock locales. Poné NEXT_PUBLIC_DEMO_MODE=false para usar la API."
              : "Conectado a la API (Supabase)."}{" "}
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
            <span className="chip">superadmin</span>
            <span className="chip chip-soft">sin auth aún</span>
          </div>
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
