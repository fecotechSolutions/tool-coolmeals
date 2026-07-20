"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader } from "@/components/ui";
import { dataApi } from "@/data/repository";
import {
  PROVINCES,
  type CommercialSettings,
  type Distributor,
  type Province,
} from "@/domain/types";

export default function ComercialPage() {
  const [settings, setSettings] = useState<CommercialSettings | null>(null);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    const [commercial, dists] = await Promise.all([
      dataApi.getCommercial(),
      dataApi.listDistributors(),
    ]);
    setSettings(commercial);
    setDistributors(dists.filter((d) => d.active));
  }

  useEffect(() => {
    void reload();
  }, []);

  function setMapProvince(province: Province, distributorId: string) {
    if (!settings) return;
    const rest = settings.provinceDistributorMap.filter(
      (row) => row.province !== province,
    );
    setSettings({
      ...settings,
      provinceDistributorMap: distributorId
        ? [...rest, { province, distributorId }]
        : rest,
    });
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await dataApi.saveCommercial(settings);
      setSettings(next);
      setMessage("Configuración comercial guardada. El bot usará estos valores en decide-route.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell current="comercial">
      <PageHeader
        title="Configuración comercial"
        description="Umbral de bultos y cobertura por provincia. La red de distribuidores se edita en Distribuidores; esta pantalla solo define reglas de derivación."
        actions={
          <button type="button" className="btn btn-primary" disabled={!settings || saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        }
      />

      {!settings ? (
        <EmptyState>Cargando reglas comerciales…</EmptyState>
      ) : (
        <div className="stack-lg">
          {message ? <p className="muted">{message}</p> : null}

          <section className="panel">
            <h2>Umbral de volumen</h2>
            <p className="muted">
              Mayoristas con volumen ≥ este valor (bultos) van a atención directa (Octavio). Por defecto 50.
            </p>
            <label className="field">
              <span>Mínimo de bultos (atención directa)</span>
              <input
                type="number"
                min={1}
                value={settings.minBundlesDefault}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    minBundlesDefault: Number(e.target.value) || 50,
                  })
                }
              />
            </label>
          </section>

          <section className="panel">
            <h2>Mapa provincia → distribuidor</h2>
            <p className="muted">
              Prioridad: código postal del lead → este mapa → provincias cubiertas del distribuidor.
              Un solo sheet recibe todos los leads derivados (no hay planilla por distribuidor).
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Provincia</th>
                    <th>Distribuidor asignado</th>
                  </tr>
                </thead>
                <tbody>
                  {PROVINCES.map((province) => {
                    const current =
                      settings.provinceDistributorMap.find(
                        (row) => row.province === province,
                      )?.distributorId ?? "";
                    return (
                      <tr key={province}>
                        <td>{province}</td>
                        <td>
                          <select
                            value={current}
                            onChange={(e) =>
                              setMapProvince(province, e.target.value)
                            }
                          >
                            <option value="">— Sin asignación fija —</option>
                            {distributors.map((d) => (
                              <option key={d.id} value={d.id}>
                                {d.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
