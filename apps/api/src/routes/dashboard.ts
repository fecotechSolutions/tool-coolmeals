import { fail, ok } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { getSupabase } from "../lib/supabase";
import {
  mapConversation,
  mapDistributor,
  type DbConversation,
  type DbDistributor,
} from "../lib/mappers";
import { requireRole } from "../middleware/auth";

type CommercialTypeKey =
  | "mayoristas"
  | "retail"
  | "minoristas"
  | "quiere_ser_distribuidor"
  | "quiere_ser_representante"
  | "fason";

const COMMERCIAL_LABELS: Record<CommercialTypeKey, string> = {
  mayoristas: "Mayoristas",
  retail: "Retail",
  minoristas: "Minoristas",
  quiere_ser_distribuidor: "Quiere ser distribuidor",
  quiere_ser_representante: "Quiere ser representante",
  fason: "Fasón",
};

const dashboardQuerySchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

function mapClientTypeToCommercialKey(
  clientType: string,
): CommercialTypeKey | null {
  if (clientType === "mayorista") return "mayoristas";
  if (clientType === "retail") return "retail";
  if (clientType === "minorista") return "minoristas";
  if (clientType === "distribuidor") return "quiere_ser_distribuidor";
  if (clientType === "representante") return "quiere_ser_representante";
  if (clientType === "fason") return "fason";
  return null;
}

function emptyCounts(): Record<CommercialTypeKey, number> {
  return {
    mayoristas: 0,
    retail: 0,
    minoristas: 0,
    quiere_ser_distribuidor: 0,
    quiere_ser_representante: 0,
    fason: 0,
  };
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfDayUtc(ymdStr: string): Date {
  return new Date(`${ymdStr}T00:00:00.000Z`);
}

function endOfDayUtc(ymdStr: string): Date {
  return new Date(`${ymdStr}T23:59:59.999Z`);
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const to = ymd(now);
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  return { from: ymd(fromDate), to };
}

function inRange(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
}

function provinceLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : "Sin provincia";
}

export const dashboardRoutes = new Hono();

dashboardRoutes.get(
  "/",
  requireRole("superadmin", "admin"),
  zValidator("query", dashboardQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const defaults = defaultRange();
    const fromStr = query.from ?? defaults.from;
    const toStr = query.to ?? defaults.to;
    const from =
      fromStr <= toStr ? startOfDayUtc(fromStr) : startOfDayUtc(toStr);
    const to = fromStr <= toStr ? endOfDayUtc(toStr) : endOfDayUtc(fromStr);
    const periodFrom = ymd(from);
    const periodTo = ymd(to);

    const supabase = getSupabase();

    const [convRes, distRes] = await Promise.all([
      supabase.from("conversations").select("*"),
      supabase.from("distributors").select("*"),
    ]);

    if (convRes.error)
      return c.json(fail("DB_ERROR", convRes.error.message), 500);
    if (distRes.error)
      return c.json(fail("DB_ERROR", distRes.error.message), 500);

    const allConversations = (convRes.data as DbConversation[]).map(
      mapConversation,
    );
    const distributors = (distRes.data as DbDistributor[]).map(mapDistributor);

    // Fuente única: Pipeline (conversations), no tabla leads.
    const conversations = allConversations.filter((x) =>
      inRange(x.createdAt, from, to),
    );

    const startOfToday = startOfDayUtc(ymd(new Date()));

    const conversationsOpen = conversations.filter(
      (x) => x.status !== "finalizado" && x.status !== "descartado",
    ).length;
    const conversationsClosed = conversations.filter(
      (x) => x.status === "finalizado" || x.status === "descartado",
    ).length;
    const noClientReplyCount = conversations.filter(
      (x) => x.status === "esperando_respuesta",
    ).length;
    const total = conversations.length || 1;

    const interest = {
      dist: conversations.filter(
        (c) =>
          c.status === "quiere_ser_distribuidor" ||
          c.clientType === "distribuidor",
      ).length,
      fason: conversations.filter(
        (c) => c.status === "quiere_ser_fason" || c.clientType === "fason",
      ).length,
      rep: conversations.filter(
        (c) =>
          c.status === "quiere_ser_representante" ||
          c.clientType === "representante",
      ).length,
    };

    const executive = {
      leadsToday: conversations.filter(
        (c) => new Date(c.createdAt) >= startOfToday,
      ).length,
      leadsMonth: conversations.length,
      conversationsOpen,
      conversationsClosed,
      noClientReplyCount,
      conversationsTotal: conversations.length,
      pctNoClientReply:
        Math.round((noClientReplyCount / total) * 1000) / 10,
      leadsQuiereSerDistribuidor: interest.dist,
      leadsFason: interest.fason,
      leadsQuiereSerRepresentante: interest.rep,
    };

    const counts = emptyCounts();
    for (const conv of conversations) {
      const key = mapClientTypeToCommercialKey(String(conv.clientType));
      if (key) counts[key] += 1;
    }
    counts.quiere_ser_distribuidor = Math.max(
      counts.quiere_ser_distribuidor,
      interest.dist,
    );
    counts.quiere_ser_representante = Math.max(
      counts.quiere_ser_representante,
      interest.rep,
    );
    counts.fason = Math.max(counts.fason, interest.fason);

    const totalTypes = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
    const percentages = (
      Object.keys(COMMERCIAL_LABELS) as CommercialTypeKey[]
    ).map((key) => ({
      key,
      label: COMMERCIAL_LABELS[key],
      count: counts[key],
      pct: Math.round((counts[key] / totalTypes) * 1000) / 10,
    }));

    const derived = conversations.filter(
      (x) => x.status === "derivado_distribuidor" && x.distributorId,
    );
    const byDistributorRaw = distributors.map((d) => ({
      distributorId: d.id,
      name: d.name,
      count: derived.filter((x) => x.distributorId === d.id).length,
    }));
    const derivedTotal =
      byDistributorRaw.reduce((sum, row) => sum + row.count, 0) || 1;

    const provinceMap = new Map<string, number>();
    for (const conv of conversations) {
      const label = provinceLabel(conv.province);
      provinceMap.set(label, (provinceMap.get(label) ?? 0) + 1);
    }
    const provinceTotal =
      Array.from(provinceMap.values()).reduce((a, b) => a + b, 0) || 1;
    const byProvince = Array.from(provinceMap.entries())
      .map(([province, count]) => ({
        province,
        count,
        pct: Math.round((count / provinceTotal) * 1000) / 10,
      }))
      .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province));

    const commercial = {
      counts,
      percentages,
      byDistributor: byDistributorRaw.map((row) => ({
        ...row,
        pct: Math.round((row.count / derivedTotal) * 1000) / 10,
      })),
      interestKpis: {
        quiereSerDistribuidor: counts.quiere_ser_distribuidor,
        fason: counts.fason,
        quiereSerRepresentante: counts.quiere_ser_representante,
      },
      byProvince,
    };

    return c.json(
      ok({
        period: { from: periodFrom, to: periodTo },
        executive,
        commercial,
      }),
    );
  },
);
