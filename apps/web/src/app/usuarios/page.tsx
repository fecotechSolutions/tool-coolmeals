"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  EmptyState,
  KpiGrid,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { getSessionUser, type AuthUser } from "@/lib/auth";
import { ApiHttpError, apiRequest } from "@/lib/http";

type ListedUser = {
  id: string;
  email: string;
  role: "superadmin" | "admin";
  mustChangePassword?: boolean;
};

export default function UsuariosPage() {
  const me = getSessionUser();
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  async function reload() {
    const data = await apiRequest<{ users: ListedUser[] }>("/auth/users");
    setUsers(data.users);
  }

  useEffect(() => {
    if (me?.role !== "superadmin") return;
    setListLoading(true);
    void reload()
      .catch((err) => {
        setError(err instanceof ApiHttpError ? err.message : "No se pudo listar");
      })
      .finally(() => setListLoading(false));
  }, [me?.role]);

  if (me?.role !== "superadmin") {
    return (
      <AppShell current="usuarios">
        <PageHeader
          title="Usuarios"
          description="Solo el superadmin puede gestionar cuentas."
        />
        <div className="panel">
          <EmptyState>No tenés permiso para esta sección.</EmptyState>
        </div>
      </AppShell>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    setLoading(true);
    try {
      await apiRequest<{ user: AuthUser }>("/auth/users", {
        method: "POST",
        body: JSON.stringify({ email, password, role: "admin" }),
      });
      setOkMsg(
        `Admin creado: ${email}. Debe cambiar la contraseña al primer ingreso.`,
      );
      setEmail("");
      setPassword("");
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiHttpError ? err.message : "No se pudo crear el usuario",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(u: ListedUser) {
    if (u.role === "superadmin") return;
    const ok = window.confirm(`¿Eliminar a ${u.email}?`);
    if (!ok) return;
    setError(null);
    setOkMsg(null);
    setDeletingId(u.id);
    try {
      await apiRequest(`/auth/users/${u.id}`, { method: "DELETE" });
      setOkMsg(`Eliminado: ${u.email}`);
      await reload();
    } catch (err) {
      setError(
        err instanceof ApiHttpError ? err.message : "No se pudo eliminar",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const adminCount = users.filter((u) => u.role === "admin").length;
  const pendingPass = users.filter((u) => u.mustChangePassword).length;

  return (
    <AppShell current="usuarios">
      <PageHeader
        title="Usuarios"
        description="Un solo superadmin. Creá y eliminá admins con email Cool Meals y contraseña temporal."
      />

      <KpiGrid
        items={[
          { label: "Cuentas", value: users.length },
          { label: "Admins", value: adminCount },
          {
            label: "Cambio de pass pendiente",
            value: pendingPass,
            hint: pendingPass ? "Deben actualizar al entrar" : undefined,
          },
        ]}
      />

      {error ? (
        <div className="flash flash-error" role="alert">
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="flash flash-ok" role="status">
          {okMsg}
        </div>
      ) : null}

      <div className="users-layout">
        <section className="panel">
          <div className="panel-head">
            <h3>Cuentas existentes</h3>
            <span className="muted">{users.length} en total</span>
          </div>
          <div className="table-wrap">
            {listLoading ? (
              <div className="loading-state">Cargando…</div>
            ) : users.length === 0 ? (
              <EmptyState>Todavía no hay usuarios listados.</EmptyState>
            ) : (
              <table className="data">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isMe = me?.email === u.email;
                    return (
                      <tr key={u.id}>
                        <td>
                          <strong>{u.email}</strong>
                          {isMe ? (
                            <span className="muted" style={{ marginLeft: "0.4rem" }}>
                              (vos)
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {u.role === "superadmin" ? (
                            <StatusBadge tone="info">superadmin</StatusBadge>
                          ) : (
                            <StatusBadge>admin</StatusBadge>
                          )}
                        </td>
                        <td>
                          {u.mustChangePassword ? (
                            <StatusBadge tone="warn">cambiar pass</StatusBadge>
                          ) : (
                            <StatusBadge tone="ok">ok</StatusBadge>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            {u.role === "admin" ? (
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={deletingId === u.id}
                                onClick={() => void onDelete(u)}
                              >
                                {deletingId === u.id ? "…" : "Eliminar"}
                              </button>
                            ) : (
                              <span className="chip chip-soft">único</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <aside className="panel users-create">
          <div className="drawer">
            <h2>Crear admin</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
              Recibe una contraseña temporal y debe cambiarla al entrar.
            </p>
            <form className="users-create-form" onSubmit={onSubmit}>
              <div className="field">
                <label>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="persona@coolmeals.com.ar"
                  autoComplete="off"
                  required
                />
              </div>
              <div className="field">
                <label>Contraseña temporal</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="form-actions" style={{ padding: 0 }}>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? "Creando…" : "Crear admin"}
                </button>
              </div>
            </form>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
