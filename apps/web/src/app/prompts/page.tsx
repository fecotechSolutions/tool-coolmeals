"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader, StatusBadge } from "@/components/ui";
import { dataApi } from "@/data/repository";
import type { PromptConfig } from "@/domain/types";

export default function PromptsPage() {
  const [prompt, setPrompt] = useState<PromptConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void dataApi.getPrompt().then(setPrompt);
  }, []);

  async function save() {
    if (!prompt) return;
    const next = await dataApi.savePrompt({
      name: prompt.name,
      personality: prompt.personality,
      tone: prompt.tone,
      objectives: prompt.objectives,
      restrictions: prompt.restrictions,
      flows: prompt.flows,
      rules: prompt.rules,
    });
    setPrompt(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  }

  const fields: Array<{
    key: keyof Pick<
      PromptConfig,
      | "personality"
      | "tone"
      | "objectives"
      | "restrictions"
      | "flows"
      | "rules"
    >;
    label: string;
    hint: string;
  }> = [
    {
      key: "personality",
      label: "Personalidad",
      hint: "Quién es el asistente y cómo se presenta.",
    },
    {
      key: "tone",
      label: "Tono",
      hint: "Estilo de comunicación.",
    },
    {
      key: "objectives",
      label: "Objetivos",
      hint: "Qué debe lograr en cada conversación.",
    },
    {
      key: "restrictions",
      label: "Restricciones",
      hint: "Límites duros (precios, promesas, datos).",
    },
    {
      key: "flows",
      label: "Flujos",
      hint: "Secuencia de calificación y derivación.",
    },
    {
      key: "rules",
      label: "Reglas",
      hint: "Uso de knowledge base y escalamiento.",
    },
  ];

  return (
    <AppShell current="prompts">
      <PageHeader
        title="Prompt Manager"
        description="Editor del prompt principal que usa la IA en WhatsApp."
        actions={
          <>
            {saved ? <StatusBadge tone="ok">Guardado</StatusBadge> : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
              disabled={!prompt}
            >
              Guardar prompt
            </button>
          </>
        }
      />

      {!prompt ? (
        <div className="panel loading-state">Cargando prompt…</div>
      ) : (
        <div className="panel">
          <div className="form-grid">
            <div className="field full">
              <label>Nombre</label>
              <input
                value={prompt.name}
                onChange={(e) =>
                  setPrompt({ ...prompt, name: e.target.value })
                }
              />
            </div>
            {fields.map((field) => (
              <div className="field full" key={field.key}>
                <label>
                  {field.label}
                  <span className="muted"> — {field.hint}</span>
                </label>
                <textarea
                  rows={4}
                  value={prompt[field.key]}
                  onChange={(e) =>
                    setPrompt({ ...prompt, [field.key]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
          <div className="form-actions">
            <p className="muted" style={{ marginRight: "auto" }}>
              Última actualización:{" "}
              {new Date(prompt.updatedAt).toLocaleString("es-AR")}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void save()}
            >
              Guardar prompt
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
