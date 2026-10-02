"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { APP_ENV, APP_ENV_LABEL } from "@/lib/app-env";
import { ApiHttpError, apiRequest } from "@/lib/http";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiRequest<{ ok: boolean; message?: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setDone(true);
    } catch (err) {
      setError(
        err instanceof ApiHttpError
          ? err.message
          : "No se pudo enviar el correo",
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
          <p className="login-sub">Restablecer contraseña</p>
          <span className={`env-pill env-pill--${APP_ENV}`}>
            {APP_ENV_LABEL[APP_ENV]}
          </span>
        </div>

        {done ? (
          <div className="login-form">
            <p>
              Si el correo existe, vas a recibir un enlace desde{" "}
              <strong>Symbionet</strong> para elegir una contraseña nueva.
            </p>
            <Link className="btn btn-primary" href="/login">
              Volver al login
            </Link>
          </div>
        ) : (
          <form className="login-form" onSubmit={onSubmit}>
            <label>
              Email de tu cuenta
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            {error ? <p className="login-error">{error}</p> : null}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Enviar enlace"}
            </button>
            <p className="login-links">
              <Link href="/login">Volver al login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
