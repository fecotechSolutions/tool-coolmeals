"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { APP_ENV, APP_ENV_LABEL } from "@/lib/app-env";
import { setSession, type AuthUser } from "@/lib/auth";
import { ApiHttpError, apiRequest } from "@/lib/http";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    if (newPassword.length < 8) {
      setError("Mínimo 8 caracteres");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{
        ok: boolean;
        token?: string;
        user?: AuthUser;
      }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (data.token && data.user) {
        setSession(data.token, data.user);
      }
      router.replace("/");
    } catch (err) {
      setError(
        err instanceof ApiHttpError
          ? err.message
          : "No se pudo cambiar la contraseña",
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
          <p className="login-sub">Cambiar contraseña</p>
          <span className={`env-pill env-pill--${APP_ENV}`}>
            {APP_ENV_LABEL[APP_ENV]}
          </span>
        </div>

        <form className="login-form" onSubmit={onSubmit}>
          <label>
            Contraseña actual
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Nueva contraseña
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
          <label>
            Confirmar nueva
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
        </form>
      </div>
    </div>
  );
}
