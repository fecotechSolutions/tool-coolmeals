"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_ENV, APP_ENV_LABEL } from "@/lib/app-env";
import { setSession, type AuthUser } from "@/lib/auth";
import { ApiHttpError, apiRequest } from "@/lib/http";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await apiRequest<{
        token: string;
        user: AuthUser;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setSession(data.token, data.user);
      if (data.user.mustChangePassword) {
        router.replace("/change-password");
        return;
      }
      const next = search.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
    } catch (err) {
      setError(
        err instanceof ApiHttpError
          ? err.message
          : "No se pudo iniciar sesión",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="brand-mark">
            <span className="cool">COOL</span>
            <span className="meals">MEALS</span>
          </div>
          <p className="login-sub">Ops · acceso interno</p>
          <span className={`env-pill env-pill--${APP_ENV}`}>
            {APP_ENV_LABEL[APP_ENV]}
          </span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <p className="login-links">
            <Link href="/forgot-password">Olvidé mi contraseña</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-loading">
          <p>Cargando…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
