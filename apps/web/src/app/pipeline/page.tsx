"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { dataApi } from "@/data/repository";
import {
  CLIENT_TYPE_LABELS,
  CONVERSATION_STATUS_LABELS,
  HASHTAG_ATENDIDO_REPRESENTANTE,
  ORIGIN_LABELS,
  PIPELINE_STATUSES,
  suggestedOrderStatus,
  type Conversation,
  type ConversationStatus,
  type Distributor,
} from "@/domain/types";

type StatusColumn = {
  kind: "status";
  key: string;
  status: ConversationStatus;
  title: string;
  subtitle: string;
};

type DistributorColumn = {
  kind: "distributor";
  key: string;
  distributorId: string;
  title: string;
  subtitle: string;
  active: boolean;
};

type PipelineColumn = StatusColumn | DistributorColumn;

/** Antes de la bifurcación distribuidores (interés vs red). */
const BEFORE_DIST_SPLIT: ConversationStatus[] = [
  "nuevo",
  "ia_atendiendo",
  "esperando_respuesta",
  "atencion_representante",
  "quiere_ser_distribuidor",
];

/** Después de columnas de red: muestras → pedidos lead/cliente. */
const AFTER_DIST_SPLIT: ConversationStatus[] = [
  "muestras",
  "pedido_lead",
  "pedido_cliente",
  "finalizado",
  "descartado",
];

function statusSubtitle(status: ConversationStatus) {
  if (status === "quiere_ser_distribuidor") {
    return "Lead quiere sumarse a la red";
  }
  if (status === "muestras") {
    return "Puede pasar a pedido lead o cliente";
  }
  if (status === "pedido_lead") {
    return "Prospecto · isCustomer = false";
  }
  if (status === "pedido_cliente") {
    return "Cuenta existente · isCustomer = true";
  }
  if (status === "atencion_representante") {
    return "Seguimiento humano Cool Meals";
  }
  return "Estado";
}

export default function PipelinePage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    const [rows, dists] = await Promise.all([
      dataApi.listConversations(),
      dataApi.listDistributors(),
    ]);
    setConversations(rows);
    setDistributors(dists);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    function onFocus() {
      void dataApi.listDistributors().then(setDistributors);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const columns: PipelineColumn[] = useMemo(() => {
    const before: StatusColumn[] = BEFORE_DIST_SPLIT.map((status) => ({
      kind: "status",
      key: `status:${status}`,
      status,
      title: CONVERSATION_STATUS_LABELS[status],
      subtitle: statusSubtitle(status),
    }));

    const distCols: DistributorColumn[] = distributors.map((d, index) => ({
      kind: "distributor",
      key: `dist:${d.id}`,
      distributorId: d.id,
      title: `Derivado · Dist. ${index + 1}`,
      subtitle: d.name,
      active: d.active,
    }));

    const after: StatusColumn[] = AFTER_DIST_SPLIT.map((status) => ({
      kind: "status",
      key: `status:${status}`,
      status,
      title: CONVERSATION_STATUS_LABELS[status],
      subtitle: statusSubtitle(status),
    }));

    return [...before, ...distCols, ...after];
  }, [distributors]);

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const col of columns) map.set(col.key, []);

    for (const row of conversations) {
      if (row.status === "derivado_distribuidor" && row.distributorId) {
        const key = `dist:${row.distributorId}`;
        if (map.has(key)) {
          map.get(key)!.push(row);
          continue;
        }
      }

      if (
        PIPELINE_STATUSES.includes(
          row.status as (typeof PIPELINE_STATUSES)[number],
        )
      ) {
        map.get(`status:${row.status}`)?.push(row);
      }
    }

    return map;
  }, [conversations, columns]);

  async function applyPatch(
    id: string,
    patch: Partial<
      Pick<
        Conversation,
        "status" | "distributorId" | "tags" | "assignedTo" | "isCustomer"
      >
    >,
  ) {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id
          ? { ...c, ...patch, updatedAt: new Date().toISOString() }
          : c,
      ),
    );
    await dataApi.updateConversation(id, patch);
  }

  async function moveToColumn(id: string, column: PipelineColumn) {
    const current = conversations.find((c) => c.id === id);
    if (!current) return;

    if (column.kind === "distributor") {
      if (
        current.status === "derivado_distribuidor" &&
        current.distributorId === column.distributorId
      ) {
        return;
      }
      await applyPatch(id, {
        status: "derivado_distribuidor",
        distributorId: column.distributorId,
      });
      return;
    }

    // Pedidos: sincronizar isCustomer con la columna elegida
    if (column.status === "pedido_lead") {
      await applyPatch(id, {
        status: "pedido_lead",
        isCustomer: false,
        distributorId: current.distributorId,
      });
      return;
    }
    if (column.status === "pedido_cliente") {
      await applyPatch(id, {
        status: "pedido_cliente",
        isCustomer: true,
        distributorId: current.distributorId,
      });
      return;
    }

    // Desde muestras se sugiere el pedido según isCustomer (si el usuario
    // arrastra a muestras no cambiamos isCustomer).
    const clearDistributor =
      column.status === "nuevo" ||
      column.status === "ia_atendiendo" ||
      column.status === "esperando_respuesta" ||
      column.status === "atencion_representante" ||
      column.status === "quiere_ser_distribuidor";

    await applyPatch(id, {
      status: column.status,
      ...(clearDistributor ? { distributorId: null } : {}),
    });
  }

  async function markAttendedByRep(card: Conversation) {
    const tags = Array.from(
      new Set([...(card.tags ?? []), HASHTAG_ATENDIDO_REPRESENTANTE]),
    );
    const nextStatus: ConversationStatus =
      card.status === "atencion_representante"
        ? "esperando_respuesta"
        : card.status;

    await applyPatch(card.id, {
      tags,
      status: nextStatus,
      assignedTo: card.assignedTo ?? "admin@coolmeals.com",
    });
  }

  async function promoteSamplesToOrder(card: Conversation) {
    const status = suggestedOrderStatus(card.isCustomer);
    await applyPatch(card.id, {
      status,
      isCustomer: card.isCustomer,
    });
  }

  function moveSelectValue(card: Conversation) {
    if (card.status === "derivado_distribuidor" && card.distributorId) {
      return `dist:${card.distributorId}`;
    }
    return `status:${card.status}`;
  }

  async function onSelectMove(card: Conversation, value: string) {
    const column = columns.find((c) => c.key === value);
    if (column) await moveToColumn(card.id, column);
  }

  return (
    <AppShell current="pipeline">
      <PageHeader
        title="Pipeline"
        description="Separá “quiere ser distribuidor” de “derivado a un dist. de la red”. Muestras → pedido lead o pedido cliente."
      />

      <div className="pipeline-legend">
        <span>
          {conversations.length} cards · {distributors.length} cols. de red
        </span>
        <span className="muted">
          Pedido lead = prospecto · Pedido cliente = cuenta existente
        </span>
      </div>

      {loading ? (
        <div className="panel loading-state">Cargando pipeline…</div>
      ) : (
        <div className="pipeline-board" role="list">
          {columns.map((column) => {
            const cards = cardsByColumn.get(column.key) ?? [];
            const isOver = dropTarget === column.key;
            const isDist = column.kind === "distributor";
            const isWantDist =
              column.kind === "status" &&
              column.status === "quiere_ser_distribuidor";

            return (
              <section
                key={column.key}
                className={[
                  "pipeline-column",
                  isOver ? "is-drop-target" : "",
                  column.kind === "status" &&
                  column.status === "atencion_representante"
                    ? "is-rep-column"
                    : "",
                  isWantDist ? "is-want-dist-column" : "",
                  isDist ? "is-dist-column" : "",
                  isDist && !column.active ? "is-dist-inactive" : "",
                  column.kind === "status" && column.status === "pedido_lead"
                    ? "is-order-lead-column"
                    : "",
                  column.kind === "status" && column.status === "pedido_cliente"
                    ? "is-order-client-column"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDropTarget(column.key);
                }}
                onDragLeave={() => {
                  setDropTarget((current) =>
                    current === column.key ? null : current,
                  );
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id =
                    event.dataTransfer.getData("text/plain") || draggingId;
                  setDropTarget(null);
                  setDraggingId(null);
                  if (id) void moveToColumn(id, column);
                }}
              >
                <header className="pipeline-column-header">
                  <div>
                    <h2>{column.title}</h2>
                    <p>{column.subtitle}</p>
                  </div>
                  <span className="pipeline-count">{cards.length}</span>
                </header>

                <div className="pipeline-column-body">
                  {cards.length === 0 ? (
                    <div className="pipeline-empty">
                      {isDist
                        ? "Derivá acá"
                        : isWantDist
                          ? "Interés en ser dist."
                          : "Soltá aquí"}
                    </div>
                  ) : (
                    cards.map((card) => {
                      const hasRepTag = (card.tags ?? []).includes(
                        HASHTAG_ATENDIDO_REPRESENTANTE,
                      );

                      return (
                        <article
                          key={card.id}
                          className={`pipeline-card${draggingId === card.id ? " is-dragging" : ""}${hasRepTag ? " has-rep-tag" : ""}`}
                          draggable
                          onDragStart={(event) => {
                            setDraggingId(card.id);
                            event.dataTransfer.setData("text/plain", card.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                        >
                          <div className="pipeline-card-top">
                            <strong>{card.name}</strong>
                            <span className="pipeline-origin">
                              {ORIGIN_LABELS[card.origin]}
                            </span>
                          </div>
                          <p className="pipeline-phone">{card.phone}</p>
                          <div className="pipeline-meta">
                            <span>{CLIENT_TYPE_LABELS[card.clientType]}</span>
                            <span>{card.province}</span>
                            <span>
                              {card.isCustomer ? "Cliente" : "Lead"}
                            </span>
                          </div>
                          <p className="pipeline-summary">{card.aiSummary}</p>

                          {(card.tags ?? []).length > 0 ? (
                            <div className="pipeline-hashtags">
                              {(card.tags ?? []).map((tag) => (
                                <span key={tag} className="pipeline-hashtag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {card.status === "muestras" ? (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm pipeline-hashtag-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                void promoteSamplesToOrder(card);
                              }}
                            >
                              Pasar a{" "}
                              {card.isCustomer
                                ? "pedido cliente"
                                : "pedido lead"}
                            </button>
                          ) : null}

                          {!hasRepTag ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm pipeline-hashtag-btn"
                              onClick={(event) => {
                                event.stopPropagation();
                                void markAttendedByRep(card);
                              }}
                            >
                              {HASHTAG_ATENDIDO_REPRESENTANTE}
                            </button>
                          ) : null}

                          <div className="pipeline-card-foot">
                            <span>
                              {new Date(card.updatedAt).toLocaleDateString(
                                "es-AR",
                              )}
                            </span>
                            <select
                              aria-label={`Mover ${card.name}`}
                              value={moveSelectValue(card)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                void onSelectMove(card, event.target.value)
                              }
                            >
                              {columns.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.kind === "distributor"
                                    ? `${option.title} · ${option.subtitle}`
                                    : option.title}
                                </option>
                              ))}
                            </select>
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
