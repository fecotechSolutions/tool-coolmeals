"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { dataApi } from "@/data/repository";
import {
  KNOWLEDGE_CATEGORY_LABELS,
  type KnowledgeArticle,
  type KnowledgeCategory,
} from "@/domain/types";

const emptyForm = {
  title: "",
  category: "faq" as KnowledgeCategory,
  content: "",
  active: true,
};

export default function ConocimientoPage() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [category, setCategory] = useState<KnowledgeCategory | "">("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  async function reload() {
    setArticles(await dataApi.listKnowledge());
  }

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(
    () =>
      category ? articles.filter((a) => a.category === category) : articles,
    [articles, category],
  );

  function startCreate() {
    setEditingId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function startEdit(article: KnowledgeArticle) {
    setEditingId(article.id);
    setForm({
      title: article.title,
      category: article.category,
      content: article.content,
      active: article.active,
    });
    setOpen(true);
  }

  async function save() {
    await dataApi.upsertKnowledge({
      id: editingId ?? undefined,
      ...form,
    });
    setOpen(false);
    await reload();
  }

  async function remove(id: string) {
    await dataApi.deleteKnowledge(id);
    await reload();
  }

  return (
    <AppShell current="conocimiento">
      <PageHeader
        title="Base de conocimiento"
        description="FAQ, precios, políticas y más. La IA consulta este contenido."
        actions={
          <button type="button" className="btn btn-primary" onClick={startCreate}>
            Nuevo artículo
          </button>
        }
      />

      {open ? (
        <div className="panel" style={{ marginBottom: "1rem" }}>
          <div className="form-grid">
            <div className="field">
              <label>Título</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    category: e.target.value as KnowledgeCategory,
                  }))
                }
              >
                {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label>Contenido</label>
              <textarea
                rows={6}
                value={form.content}
                onChange={(e) =>
                  setForm((f) => ({ ...f, content: e.target.value }))
                }
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
        <div className="toolbar">
          <div className="field">
            <label>Categoría</label>
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as KnowledgeCategory | "")
              }
            >
              <option value="">Todas</option>
              {Object.entries(KNOWLEDGE_CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          {filtered.length === 0 ? (
            <EmptyState>No hay artículos.</EmptyState>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Título</th>
                  <th>Categoría</th>
                  <th>Contenido</th>
                  <th>Estado</th>
                  <th>Actualizado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((article) => (
                  <tr key={article.id}>
                    <td>
                      <strong>{article.title}</strong>
                    </td>
                    <td>{KNOWLEDGE_CATEGORY_LABELS[article.category]}</td>
                    <td style={{ maxWidth: 360 }}>{article.content}</td>
                    <td>
                      <StatusBadge tone={article.active ? "ok" : "danger"}>
                        {article.active ? "Activo" : "Inactivo"}
                      </StatusBadge>
                    </td>
                    <td className="muted">
                      {new Date(article.updatedAt).toLocaleDateString("es-AR")}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => startEdit(article)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void remove(article.id)}
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
