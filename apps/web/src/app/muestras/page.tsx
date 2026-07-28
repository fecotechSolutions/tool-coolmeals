"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { dataApi } from "@/data/repository";
import type { SampleRequest } from "@/domain/types";

export default function MuestrasPage() {
  const [rows, setRows] = useState<SampleRequest[]>([]);

  useEffect(() => {
    void dataApi.listSamples().then(setRows);
  }, []);

  return (
    <AppShell current="muestras">
      <PageHeader
        title="Muestras"
        description="Agenda de envíos Cool Meals (solo cuando Cool Meals atiende, no la red de dist.): nombre, teléfono, empresa, provincia, DNI, correo, código postal y dirección completa."
      />

      {rows.length === 0 ? (
        <EmptyState>
          Sin solicitudes todavía. Aparecen cuando un lead de atención Cool Meals
          completa los datos de envío (no aplica a leads derivados a distribuidores).
        </EmptyState>
      ) : (
        <div className="table-wrap panel">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Empresa</th>
                <th>Provincia</th>
                <th>DNI</th>
                <th>Correo</th>
                <th>CP</th>
                <th>Dirección completa</th>
                <th>Sheet</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleDateString("es-AR")}</td>
                  <td>{row.fullName}</td>
                  <td>{row.phone}</td>
                  <td>{row.company || "—"}</td>
                  <td>{row.province || "—"}</td>
                  <td>{row.dni || "—"}</td>
                  <td>{row.email || "—"}</td>
                  <td>{row.postalCode || "—"}</td>
                  <td>{row.address || "—"}</td>
                  <td>
                    {row.sheetSyncedAt ? (
                      <StatusBadge tone="ok">sync</StatusBadge>
                    ) : (
                      <StatusBadge tone="warn">pendiente sync</StatusBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
