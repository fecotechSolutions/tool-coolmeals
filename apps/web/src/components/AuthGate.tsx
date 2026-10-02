"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DEMO_MODE } from "@/data/repository";
import {
  clearSession,
  getSessionToken,
  getSessionUser,
  setSession,
  type AuthUser,
} from "@/lib/auth";
import { apiRequest } from "@/lib/http";

const PUBLIC_PATHS = new Set([
  "/login",
  "/forgot-password",
  "/reset-password",
]);

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(DEMO_MODE);
  const [user, setUser] = useState<AuthUser | null>(
    DEMO_MODE
      ? { email: "demo@local", role: "superadmin", mustChangePassword: false }
      : null,
  );

  const isPublic = PUBLIC_PATHS.has(pathname);
  const isChangePassword = pathname === "/change-password";

  useEffect(() => {
    if (DEMO_MODE) {
      setReady(true);
      return;
    }

    let cancelled = false;

    async function boot() {
      const token = getSessionToken();
      if (!token) {
        if (!isPublic) {
          const next = encodeURIComponent(pathname);
          router.replace(`/login?next=${next}`);
        }
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const data = await apiRequest<{ user: AuthUser }>("/auth/me");
        if (cancelled) return;
        setSession(token, data.user);
        setUser(data.user);

        if (data.user.mustChangePassword && !isChangePassword) {
          router.replace("/change-password");
        } else if (isPublic && !data.user.mustChangePassword) {
          router.replace("/");
        } else if (isPublic && data.user.mustChangePassword) {
          router.replace("/change-password");
        }
      } catch {
        if (cancelled) return;
        clearSession();
        setUser(null);
        if (!isPublic) {
          router.replace("/login");
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [isPublic, isChangePassword, pathname, router]);

  if (!ready) {
    return (
      <div className="auth-loading">
        <p>Cargando…</p>
      </div>
    );
  }

  if (
    !DEMO_MODE &&
    !isPublic &&
    !isChangePassword &&
    !user &&
    !getSessionUser()
  ) {
    return (
      <div className="auth-loading">
        <p>Redirigiendo al login…</p>
      </div>
    );
  }

  return <>{children}</>;
}
