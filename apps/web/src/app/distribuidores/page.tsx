"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { dataApi } from "@/data/repository";
import { PROVINCES, type Distributor, type Province } from "@/domain/types";

const emptyForm = {
  name: "",
  province: "Córdoba" as Province,
  zones: "",
  contactName: "",
  whatsapp: "",
  email: "",
  active: true,
  coveredProvinces: [] as Province[],
  postalCodes: "",
};

export default function DistribuidoresPage() {
  const [rows, setRows] = useState<Distributor[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function reload() {
    setRows(await dataApi.listDistributors());
  }

  useEffect(() => {
    void reload();
  }, []);

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(row: Distributor) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      province: row.province,
      zones: row.zones.join(", "),
      contactName: row.contactName,
      whatsapp: row.whatsapp,
      email: row.email,
      active: row.active,
      coveredProvinces: row.coveredProvinces,
      postalCodes: row.postalCodes.join(", "),
    });
    setOpen(true);
  }

  async function save() {
    await dataApi.upsertDistributor({
      id: editingId ?? undefined,
      name: form.name,
      province: form.province,
      zones: form.zones
        .split(",")
        .map((z) => z.trim())
        .filter(Boolean),
      contactName: form.contactName,
      whatsapp: form.whatsapp,
      email: form.email,
      active: form.active,
      coveredProvinces: form.coveredProvinces,
      postalCodes: form.postalCodes
        .split(",")
        .map((z) => z.trim())
        .filter(Boolean),
    });
    setOpen(false);
    await reload();
  }

  async function remove(id: string) {
    await dataApi.deleteDistributor(id);
    await reload();
  }

  function toggleProvince(province: Province) {
    setForm((f) => ({
      ...f,
      coveredProvinces: f.coveredProvinces.includes(province)
        ? f.coveredProvinces.filter((p) => p !== province)
        : [...f.coveredProvinces, province],
    }));
  }

  return (
    <AppShell current="distribuidores">
      <PageHeader
        title="Distribuidores"
        description="Alta, baja y edición. Cada distribuidor nuevo aparece como columna en el Pipeline."
        actions={
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            Nuevo distribuidor
          </button>
        }
      />

      {open ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="form-grid">
            <div className="field">
              <label>Nombre</label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Provincia base</label>
              <select
                value={form.province}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    province: e.target.value as Province,
                  }))
                }
              >
                {PROVINCES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Zonas (separadas por coma)</label>
              <input
                value={form.zones}
                onChange={(e) => setForm((f) => ({ ...f, zones: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Persona contacto</label>
              <input
                value={form.contactName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactName: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>WhatsApp</label>
              <input
                value={form.whatsapp}
                onChange={(e) =>
                  setForm((f) => ({ ...f, whatsapp: e.target.value }))
                }
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Activo</label>
              <select
                value={form.active ? "1" : "0"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, active: e.target.value === "1" }))
                }
              >
                <option value="1">Sí</option>
                <option value="0">No</option>
              </select>
            </div>
            <div className="field">
              <label>Códigos postales (coma)</label>
              <input
                value={form.postalCodes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, postalCodes: e.target.value }))
                }
              />
            </div>
            <div className="field full">
              <label>Provincias que cubre</label>
              <div className="tag-list" style={{ marginTop: "0.35rem" }}>
                {PROVINCES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="tag"
                    style={{
                      opacity: form.coveredProvinces.includes(p) ? 1 : 0.45,
                      cursor: "pointer",
                      border: 0,
                    }}
                    onClick={() => toggleProvince(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void save()}>
              Guardar
            </button>
          </div>
        </div>
      ) : null}

      <div className="panel">
        <div className="table-wrap">
          {rows.length === 0 ? (
            <EmptyState>Sin distribuidores.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Provincia</th>
                  <th>Zonas</th>
                  <th>Contacto</th>
                  <th>WhatsApp</th>
                  <th>Email</th>
                  <th>Activo</th>
                  <th>Provincias</th>
                  <th>CPs</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.province}</td>
                    <td>{row.zones.join(", ")}</td>
                    <td>{row.contactName}</td>
                    <td>{row.whatsapp}</td>
                    <td>{row.email}</td>
                    <td>
                      <StatusBadge tone={row.active ? "ok" : "danger"}>
                        {row.active ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </td>
                    <td>
                      <div className="tag-list">
                        {row.coveredProvinces.map((p) => (
                          <span key={p} className="tag">
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{row.postalCodes.join(", ")}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(row)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void remove(row.id)}
                        >
                          Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
