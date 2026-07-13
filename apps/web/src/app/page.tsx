"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import {
  BarChart,
  ComparisonList,
  DonutChart,
  MultiSeriesBarChart,
} from "@/components/charts";
import { KpiGrid, PageHeader } from "@/components/ui";
import { dataApi } from "@/data/repository";
import type { CommercialDashboard, ExecutiveDashboard } from "@/domain/types";

export default function DashboardPage() {
  const [executive, setExecutive] = useState<ExecutiveDashboard | null>(null);
  const [commercial, setCommercial] = useState<CommercialDashboard | null>(
    null,
  );

  useEffect(() => {
    void dataApi.getDashboard().then((data) => {
      setExecutive(data.executive);
      setCommercial(data.commercial);
    });
  }, []);

  return (
    <AppShell current="dashboard">
      <PageHeader
        title="Dashboard"
        description="Ejecutivo + comercial. Intereses (distribuidor / fasón / representante) y derivados por red."
      />

      {!executive || !commercial ? (
        <div className="panel loading-state">Cargando métricas…</div>
      ) : (
        <div className="stack">
          <section className="dash-section">
            <div className="dash-section-head">
              <h2>1. Dashboard Ejecutivo</h2>
              <p>Operación del día + ingresos por interés</p>
            </div>
            <KpiGrid
              items={[
                { label: "Leads recibidos hoy", value: executive.leadsToday },
                {
                  label: "Leads recibidos este mes",
                  value: executive.leadsMonth,
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
                Mix por tipo de cliente · derivados a cada distribuidor de la
                red
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
                title="Clientes derivados por distribuidor"
                data={commercial.byDistributor.map((row) => ({
                  label: row.name,
                  value: row.count,
                }))}
              />
              <MultiSeriesBarChart
                title="Evolución mensual por tipo"
                categories={commercial.monthlyEvolution.map((m) => m.label)}
                series={[
                  {
                    key: "mayoristas",
                    label: "Mayoristas",
                    values: commercial.monthlyEvolution.map((m) => m.mayoristas),
                    color: "#03487a",
                  },
                  {
                    key: "retail",
                    label: "Retail",
                    values: commercial.monthlyEvolution.map((m) => m.retail),
                    color: "#0f8fb3",
                  },
                  {
                    key: "minoristas",
                    label: "Minoristas",
                    values: commercial.monthlyEvolution.map((m) => m.minoristas),
                    color: "#d0b48f",
                  },
                  {
                    key: "quiere_ser_distribuidor",
                    label: "Quiere ser dist.",
                    values: commercial.monthlyEvolution.map(
                      (m) => m.quiere_ser_distribuidor,
                    ),
                    color: "#11195c",
                  },
                  {
                    key: "fason",
                    label: "Fasón",
                    values: commercial.monthlyEvolution.map((m) => m.fason),
                    color: "#575757",
                  },
                  {
                    key: "quiere_ser_representante",
                    label: "Quiere ser repr.",
                    values: commercial.monthlyEvolution.map(
                      (m) => m.quiere_ser_representante,
                    ),
                    color: "#bbd8f9",
                  },
                ]}
              />
              <ComparisonList
                title="Comparación vs mes anterior"
                rows={commercial.vsPreviousMonth}
              />
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
                      <th>% sobre derivados</th>
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
