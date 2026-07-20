"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { BarChart, DonutChart } from "@/components/charts";
import { KpiGrid, PageHeader } from "@/components/ui";
import { dataApi } from "@/data/repository";
import type { CommercialDashboard, ExecutiveDashboard } from "@/domain/types";

type Preset = "today" | "7d" | "month" | "30d" | "custom";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function rangeForPreset(preset: Preset): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  if (preset === "today") return { from: to, to };
  if (preset === "7d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from: ymd(from), to };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setUTCDate(from.getUTCDate() - 29);
    return { from: ymd(from), to };
  }
  // month
  return {
    from: ymd(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))),
    to,
  };
}

export default function DashboardPage() {
  const [executive, setExecutive] = useState<ExecutiveDashboard | null>(null);
  const [commercial, setCommercial] = useState<CommercialDashboard | null>(
    null,
  );
  const [period, setPeriod] = useState<{ from: string; to: string }>(() =>
    rangeForPreset("month"),
  );
  const [preset, setPreset] = useState<Preset>("month");
  const [draftFrom, setDraftFrom] = useState(period.from);
  const [draftTo, setDraftTo] = useState(period.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await dataApi.getDashboard({ from, to });
      setExecutive(data.executive);
      setCommercial(data.commercial);
      if (data.period) setPeriod(data.period);
      else setPeriod({ from, to });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period.from, period.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only; filters call load
  }, []);

  function applyPreset(next: Preset) {
    setPreset(next);
    if (next === "custom") {
      setDraftFrom(period.from);
      setDraftTo(period.to);
      return;
    }
    const range = rangeForPreset(next);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setPeriod(range);
    void load(range.from, range.to);
  }

  function applyCustom() {
    const from = draftFrom <= draftTo ? draftFrom : draftTo;
    const to = draftFrom <= draftTo ? draftTo : draftFrom;
    setPreset("custom");
    setPeriod({ from, to });
    setDraftFrom(from);
    setDraftTo(to);
    void load(from, to);
  }

  const periodLabel = useMemo(() => {
    if (period.from === period.to) return period.from;
    return `${period.from} → ${period.to}`;
  }, [period]);

  return (
    <AppShell current="dashboard">
      <PageHeader
        title="Dashboard"
        description="Ejecutivo + comercial. Filtrá por fecha; los números salen del Pipeline (conversaciones), no de la tabla de leads."
      />

      <div className="dash-filters panel">
        <div className="dash-filters-presets" role="group" aria-label="Período">
          {(
            [
              ["today", "Hoy"],
              ["7d", "7 días"],
              ["month", "Este mes"],
              ["30d", "30 días"],
              ["custom", "Personalizado"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={
                preset === key ? "dash-filter-chip is-active" : "dash-filter-chip"
              }
              onClick={() => applyPreset(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dash-filters-custom">
          <label>
            Desde
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => {
                setPreset("custom");
                setDraftFrom(e.target.value);
              }}
            />
          </label>
          <label>
            Hasta
            <input
              type="date"
              value={draftTo}
              onChange={(e) => {
                setPreset("custom");
                setDraftTo(e.target.value);
              }}
            />
          </label>
          <button type="button" className="btn primary" onClick={applyCustom}>
            Aplicar
          </button>
        </div>
        <p className="dash-filters-period muted">
          Período activo: <strong>{periodLabel}</strong>
        </p>
      </div>

      {error ? (
        <div className="panel loading-state">{error}</div>
      ) : loading || !executive || !commercial ? (
        <div className="panel loading-state">Cargando métricas…</div>
      ) : (
        <div className="stack">
          <section className="dash-section">
            <div className="dash-section-head">
              <h2>1. Dashboard Ejecutivo</h2>
              <p>Operación del período + ingresos por interés</p>
            </div>
            <KpiGrid
              items={[
                {
                  label: "Leads en el período",
                  value: executive.leadsMonth,
                },
                {
                  label: "Leads hoy (en el período)",
                  value: executive.leadsToday,
                },
                {
                  label: "Conversaciones no finalizadas",
                  value: executive.conversationsOpen,
                },
                {
                  label: "Conversaciones finalizadas",
                  value: executive.conversationsClosed,
                },
                {
                  label: "% sin respuesta del cliente",
                  value: `${executive.pctNoClientReply}%`,
                  hint: `${executive.noClientReplyCount} de ${executive.conversationsTotal}`,
                },
                {
                  label: "Quiere ser distribuidor",
                  value: executive.leadsQuiereSerDistribuidor,
                  hint: "Leads interesados en sumarse a la red",
                },
                {
                  label: "Fasón",
                  value: executive.leadsFason,
                  hint: "Interés en producción a fasón",
                },
                {
                  label: "Quiere ser representante",
                  value: executive.leadsQuiereSerRepresentante,
                  hint: "Aspiran a representar Cool Meals",
                },
              ]}
            />
          </section>

          <section className="dash-section">
            <div className="dash-section-head">
              <h2>2. Dashboard Comercial</h2>
              <p>
                Mix por tipo · por provincia · derivados a cada distribuidor
              </p>
            </div>

            <KpiGrid
              items={[
                {
                  label: "Mayoristas",
                  value: commercial.counts.mayoristas,
                },
                { label: "Retail", value: commercial.counts.retail },
                {
                  label: "Minoristas",
                  value: commercial.counts.minoristas,
                },
                {
                  label: "Quiere ser distribuidor",
                  value: commercial.interestKpis.quiereSerDistribuidor,
                },
                {
                  label: "Fasón",
                  value: commercial.interestKpis.fason,
                },
                {
                  label: "Quiere ser representante",
                  value: commercial.interestKpis.quiereSerRepresentante,
                },
              ]}
            />

            <div className="charts-grid">
              <DonutChart
                title="% por tipo de cliente / interés"
                data={commercial.percentages.map((row) => ({
                  label: `${row.label} (${row.pct}%)`,
                  value: row.count,
                }))}
              />
              <BarChart
                title="Leads por provincia"
                data={commercial.byProvince.map((row) => ({
                  label: row.province,
                  value: row.count,
                }))}
              />
              <BarChart
                title="Clientes derivados por distribuidor"
                data={commercial.byDistributor.map((row) => ({
                  label: row.name,
                  value: row.count,
                }))}
              />
            </div>

            <div className="panel" style={{ padding: "1rem" }}>
              <h3 style={{ marginTop: 0, color: "var(--navy)" }}>
                Por provincia (detalle)
              </h3>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Provincia</th>
                      <th>Conversaciones</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercial.byProvince.length === 0 ? (
                      <tr>
                        <td colSpan={3}>Sin datos en el período</td>
                      </tr>
                    ) : (
                      commercial.byProvince.map((row) => (
                        <tr key={row.province}>
                          <td>{row.province}</td>
                          <td>{row.count}</td>
                          <td>{row.pct}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel" style={{ padding: "1rem" }}>
              <h3 style={{ marginTop: 0, color: "var(--navy)" }}>
                Derivados por distribuidor (detalle)
              </h3>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Distribuidor</th>
                      <th>Clientes / leads derivados</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commercial.byDistributor.map((row) => (
                      <tr key={row.distributorId}>
                        <td>{row.name}</td>
                        <td>{row.count}</td>
                        <td>{row.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
