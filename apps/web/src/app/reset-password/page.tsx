"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { APP_ENV, APP_ENV_LABEL } from "@/lib/app-env";
import { ApiHttpError, apiRequest } from "@/lib/http";

function ResetForm() {
  const router = useRouter();
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (password.length < 8) {
      setError("Mínimo 8 caracteres");
      return;
    }
    if (!token) {
      setError("Falta el token del enlace");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      router.replace("/login");
    } catch (err) {
      setError(
        err instanceof ApiHttpError
          ? err.message
          : "No se pudo restablecer la contraseña",
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
          <p className="login-sub">Nueva contraseña</p>
          <span className={`env-pill env-pill--${APP_ENV}`}>
            {APP_ENV_LABEL[APP_ENV]}
          </span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label>
            Confirmar
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
            />
          </label>
          {error ? <p className="login-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Guardando…" : "Guardar"}
          </button>
          <p className="login-links">
            <Link href="/login">Volver al login</Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-loading">
          <p>Cargando…</p>
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
