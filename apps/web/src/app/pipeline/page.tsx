"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/ui";
import { dataApi } from "@/data/repository";
import {
  CLIENT_TYPE_LABELS,
  CONVERSATION_STATUS_LABELS,
  HASHTAG_ATENCION_HUMANA,
  ORIGIN_LABELS,
  PIPELINE_STATUSES,
  distributorHashtag,
  suggestedOrderStatus,
  type Conversation,
  type ConversationStatus,
  type Distributor,
} from "@/domain/types";

type PipelineColumn = {
  key: string;
  status: ConversationStatus;
  title: string;
  subtitle: string;
};

function statusSubtitle(status: ConversationStatus) {
  if (status === "quiere_ser_distribuidor") {
    return "Handoff al agente comercial";
  }
  if (status === "quiere_ser_representante") {
    return "Handoff al equipo comercial";
  }
  if (status === "quiere_ser_fason") {
    return "Handoff al equipo comercial";
  }
  if (status === "derivado_distribuidor") {
    return "Una sola columna · el dist. va en el hashtag";
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

function stripDistributorHashtags(
  tags: string[],
  distributors: Distributor[],
) {
  const known = new Set(
    distributors.map((d) => distributorHashtag(d.name)),
  );
  return tags.filter(
    (tag) => !tag.startsWith("#derivado_") && !known.has(tag),
  );
}

/** Persiste el hashtag del dist. en tags (una vez derivado, no se borra al cambiar de columna). */
function withDistributorHashtag(
  tags: string[],
  distributorName: string | null,
  distributors: Distributor[],
) {
  const next = [...tags];
  if (!distributorName) return next;
  const tag = distributorHashtag(distributorName);
  // Al cambiar de dist., reemplazamos el hashtag de dist. anterior por el nuevo.
  const withoutOld = stripDistributorHashtags(next, distributors);
  if (!withoutOld.includes(tag)) withoutOld.push(tag);
  return withoutOld;
}

function stripLegacyRepHashtags(tags: string[]) {
  return tags.filter(
    (tag) =>
      tag !== "#atendido_por_representante" &&
      tag !== HASHTAG_ATENCION_HUMANA,
  );
}

function withHumanAttentionHashtag(tags: string[]) {
  return Array.from(
    new Set([...stripLegacyRepHashtags(tags), HASHTAG_ATENCION_HUMANA]),
  );
}

function isDistributorTag(tag: string, distributors: Distributor[]) {
  if (tag.startsWith("#derivado_")) return true;
  return distributors.some((d) => distributorHashtag(d.name) === tag);
}

function isHumanAttentionTag(tag: string) {
  return tag === HASHTAG_ATENCION_HUMANA || tag === "#atendido_por_representante";
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

  const columns: PipelineColumn[] = useMemo(
    () =>
      PIPELINE_STATUSES.map((status) => ({
        key: `status:${status}`,
        status,
        title: CONVERSATION_STATUS_LABELS[status],
        subtitle: statusSubtitle(status),
      })),
    [],
  );

  const cardsByColumn = useMemo(() => {
    const map = new Map<string, Conversation[]>();
    for (const col of columns) map.set(col.key, []);

    for (const row of conversations) {
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

  function distName(id: string | null) {
    if (!id) return null;
    return distributors.find((d) => d.id === id)?.name ?? null;
  }

  function cardTags(card: Conversation) {
    let tags = stripLegacyRepHashtags(card.tags ?? []);
    const name = distName(card.distributorId);
    if (name) {
      const tag = distributorHashtag(name);
      const legacy = `#derivado_${tag.slice(1)}`;
      if (!tags.includes(tag) && !tags.includes(legacy)) {
        tags = [...tags, tag];
      }
    }
    if (
      card.status === "atencion_representante" ||
      card.status === "quiere_ser_distribuidor" ||
      card.status === "quiere_ser_representante" ||
      card.status === "quiere_ser_fason"
    ) {
      tags = withHumanAttentionHashtag(tags);
    }
    return Array.from(new Set(tags));
  }

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

    if (column.status === "atencion_representante") {
      await handoffToHuman(current, "atencion_representante");
      return;
    }

    if (column.status === "quiere_ser_distribuidor") {
      await handoffToHuman(current, "quiere_ser_distribuidor");
      return;
    }

    if (column.status === "quiere_ser_representante") {
      await handoffToHuman(current, "quiere_ser_representante");
      return;
    }

    if (column.status === "quiere_ser_fason") {
      await handoffToHuman(current, "quiere_ser_fason");
      return;
    }

    if (column.status === "sin_cobertura") {
      await handoffToHuman(current, "sin_cobertura");
      return;
    }

    if (column.status === "derivado_distribuidor") {
      const distributorId =
        current.distributorId ??
        distributors.find((d) => d.active)?.id ??
        distributors[0]?.id ??
        null;
      const name = distName(distributorId);
      const tags = withDistributorHashtag(
        current.tags ?? [],
        name,
        distributors,
      );

      await applyPatch(id, {
        status: "derivado_distribuidor",
        distributorId,
        tags,
      });
      return;
    }

    if (column.status === "pedido_lead") {
      await applyPatch(id, {
        status: "pedido_lead",
        isCustomer: false,
      });
      return;
    }

    if (column.status === "pedido_cliente") {
      await applyPatch(id, {
        status: "pedido_cliente",
        isCustomer: true,
      });
      return;
    }

    const clearDistributor =
      column.status === "nuevo" ||
      column.status === "ia_atendiendo" ||
      column.status === "esperando_respuesta";

    // Limpiar distributorId no borra el hashtag: si alguna vez fue derivado, queda.
    await applyPatch(id, {
      status: column.status,
      ...(clearDistributor ? { distributorId: null } : {}),
    });
  }

  async function assignDistributor(card: Conversation, distributorId: string) {
    const name = distName(distributorId);
    const tags = withDistributorHashtag(card.tags ?? [], name, distributors);

    await applyPatch(card.id, {
      status: "derivado_distribuidor",
      distributorId,
      tags,
    });
  }

  async function handoffToHuman(
    card: Conversation,
    status:
      | "atencion_representante"
      | "quiere_ser_distribuidor"
      | "quiere_ser_representante"
      | "quiere_ser_fason"
      | "sin_cobertura" = "atencion_representante",
  ) {
    try {
      const reason =
        status === "quiere_ser_distribuidor"
          ? "Quiere ser distribuidor — handoff comercial desde Pipeline"
          : status === "quiere_ser_representante"
            ? "Quiere ser representante — handoff comercial desde Pipeline"
            : status === "quiere_ser_fason"
              ? "Quiere ser fasón — handoff comercial desde Pipeline"
              : status === "sin_cobertura"
                ? "Sin cobertura — handoff desde Pipeline"
                : "Atención humana desde Pipeline";
      const updated = await dataApi.handoffConversation(
        card.id,
        reason,
        status,
      );
      if (updated) {
        setConversations((prev) =>
          prev.map((c) => (c.id === card.id ? updated : c)),
        );
        return;
      }
    } catch (error) {
      console.error("[pipeline] handoff failed", error);
    }
    await applyPatch(card.id, {
      status,
      assignedTo: card.assignedTo ?? "admin@coolmeals.com",
      tags:
        status === "sin_cobertura"
          ? stripLegacyRepHashtags(card.tags ?? [])
          : withHumanAttentionHashtag(card.tags ?? []),
    });
  }

  async function promoteSamplesToOrder(card: Conversation) {
    const status = suggestedOrderStatus(card.isCustomer);
    await applyPatch(card.id, {
      status,
      isCustomer: card.isCustomer,
    });
  }

  return (
    <AppShell current="pipeline">
      <PageHeader
        title="Pipeline"
        description="Una sola columna “Derivado a distribuidor”. El destinatario se ve como hashtag en la card."
      />

      <div className="pipeline-legend">
        <span>{conversations.length} cards en el pipeline</span>
        <span className="muted">
          Hashtag ejemplo: #Cool_Logistica_Cuyo (naranja)
        </span>
      </div>

      {loading ? (
        <div className="panel loading-state">Cargando pipeline…</div>
      ) : (
        <div className="pipeline-board" role="list">
          {columns.map((column) => {
            const cards = cardsByColumn.get(column.key) ?? [];
            const isOver = dropTarget === column.key;
            const isDerived = column.status === "derivado_distribuidor";
            const isWantDist = column.status === "quiere_ser_distribuidor";
            const isWantRep = column.status === "quiere_ser_representante";
            const isWantFason = column.status === "quiere_ser_fason";

            return (
              <section
                key={column.key}
                className={[
                  "pipeline-column",
                  isOver ? "is-drop-target" : "",
                  column.status === "atencion_representante"
                    ? "is-rep-column"
                    : "",
                  isWantDist || isWantRep || isWantFason
                    ? "is-want-dist-column"
                    : "",
                  isDerived ? "is-dist-column" : "",
                  column.status === "pedido_lead" ? "is-order-lead-column" : "",
                  column.status === "pedido_cliente"
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
                      {isDerived
                        ? "Derivá acá"
                        : isWantDist
                          ? "Interés en ser dist."
                          : "Soltá aquí"}
                    </div>
                  ) : (
                    cards.map((card) => {
                      const tags = cardTags(card);
                      const isHumanAttention =
                        card.status === "atencion_representante";

                      return (
                        <article
                          key={card.id}
                          className={`pipeline-card${draggingId === card.id ? " is-dragging" : ""}${isHumanAttention ? " has-rep-tag" : ""}`}
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

                          {tags.length > 0 ? (
                            <div className="pipeline-hashtags">
                              {tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`pipeline-hashtag${isDistributorTag(tag, distributors) ? " is-dist-tag" : ""}${isHumanAttentionTag(tag) ? " is-human-tag" : ""}`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {card.status === "derivado_distribuidor" ? (
                            <div className="field" style={{ marginTop: "0.55rem" }}>
                              <label>Distribuidor</label>
                              <select
                                value={card.distributorId ?? ""}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  void assignDistributor(
                                    card,
                                    event.target.value,
                                  )
                                }
                              >
                                <option value="" disabled>
                                  Elegir…
                                </option>
                                {distributors.map((d, index) => (
                                  <option key={d.id} value={d.id}>
                                    Dist. {index + 1} · {d.name}
                                  </option>
                                ))}
                              </select>
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

                          <div className="pipeline-card-foot">
                            <span>
                              {new Date(card.updatedAt).toLocaleDateString(
                                "es-AR",
                              )}
                            </span>
                            <select
                              aria-label={`Mover ${card.name}`}
                              value={`status:${card.status}`}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const column = columns.find(
                                  (c) => c.key === event.target.value,
                                );
                                if (column) void moveToColumn(card.id, column);
                              }}
                            >
                              {columns.map((option) => (
                                <option key={option.key} value={option.key}>
                                  {option.title}
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
