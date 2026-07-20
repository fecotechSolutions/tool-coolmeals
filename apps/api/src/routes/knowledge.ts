import {
  createKnowledgeArticleSchema,
  fail,
  ok,
  updateKnowledgeArticleSchema,
} from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getSupabase } from "../lib/supabase";
import { requireRole } from "../middleware/auth";

export const knowledgeRoutes = new Hono();

function mapArticle(row: {
  id: string;
  title: string;
  category: string;
  content: string;
  active: boolean;
  updated_at: string;
}) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content,
    active: row.active,
    updatedAt: row.updated_at,
  };
}

knowledgeRoutes.get("/", requireRole("superadmin", "admin"), async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("knowledge_articles")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  return c.json(ok((data ?? []).map(mapArticle)));
});

knowledgeRoutes.post(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("json", createKnowledgeArticleSchema),
  async (c) => {
    const body = c.req.valid("json");
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("knowledge_articles")
      .insert({
        title: body.title,
        category: body.category,
        content: body.content ?? "",
        active: body.active ?? true,
      })
      .select("*")
      .single();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    return c.json(ok(mapArticle(data)), 201);
  },
);

knowledgeRoutes.patch(
  "/:id",
  requireRole("superadmin", "admin"),
  zValidator("json", updateKnowledgeArticleSchema),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const supabase = getSupabase();

    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.category !== undefined) patch.category = body.category;
    if (body.content !== undefined) patch.content = body.content;
    if (body.active !== undefined) patch.active = body.active;

    const { data, error } = await supabase
      .from("knowledge_articles")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return c.json(fail("DB_ERROR", error.message), 500);
    if (!data) return c.json(fail("NOT_FOUND", "Article not found"), 404);
    return c.json(ok(mapArticle(data)));
  },
);

knowledgeRoutes.delete("/:id", requireRole("superadmin", "admin"), async (c) => {
  const id = c.req.param("id");
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("knowledge_articles")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return c.json(fail("DB_ERROR", error.message), 500);
  if (!data) return c.json(fail("NOT_FOUND", "Article not found"), 404);
  return c.json(ok({ id }));
});
