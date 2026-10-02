import { fail, ok } from "@coolmeals/shared";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  consumeResetToken,
  createAppUser,
  deleteAppUser,
  ensureBootstrapSuperadmin,
  findUserByEmail,
  findUserById,
  listAppUsers,
  publicUser,
  saveResetToken,
  updateUserPassword,
} from "../lib/app-users";
import { getEnv } from "../env";
import { isMailConfigured, sendPasswordResetEmail } from "../lib/mailer";
import {
  createResetToken,
  hashPassword,
  hashToken,
  isStrongEnoughPassword,
  normalizeEmail,
  verifyPassword,
} from "../lib/password";
import { createSessionToken, type SessionUser } from "../lib/session";
import { requireRole, requireSession } from "../middleware/auth";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z.string().min(20),
  password: z.string().min(8),
});

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  /** Solo se crean admins; el único superadmin es el bootstrap. */
  role: z.literal("admin").default("admin"),
});

export const authRoutes = new Hono<{
  Variables: { user: SessionUser };
}>();

function toSession(row: {
  id: string;
  email: string;
  role: "superadmin" | "admin";
  must_change_password: boolean;
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    mustChangePassword: row.must_change_password,
  };
}

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  try {
    await ensureBootstrapSuperadmin();
  } catch (err) {
    console.error("[auth] bootstrap", err);
    return c.json(
      fail(
        "DB_ERROR",
        err instanceof Error ? err.message : "No se pudo inicializar usuarios",
      ),
      500,
    );
  }

  const { email, password } = c.req.valid("json");
  let row;
  try {
    row = await findUserByEmail(email);
  } catch (err) {
    console.error("[auth] findUser", err);
    return c.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
      500,
    );
  }

  if (!row || !row.active) {
    return c.json(fail("UNAUTHORIZED", "Email o contraseña incorrectos"), 401);
  }

  const okPass = await verifyPassword(password, row.password_hash);
  if (!okPass) {
    return c.json(fail("UNAUTHORIZED", "Email o contraseña incorrectos"), 401);
  }

  const user = toSession(row);
  const token = createSessionToken(user);
  return c.json(ok({ token, user: publicUser(row) }));
});

authRoutes.post("/logout", async (c) => c.json(ok({ ok: true })));

authRoutes.get("/me", requireSession, async (c) => {
  const session = c.get("user");
  if (session.email === "internal@tooling") {
    return c.json(ok({ user: session }));
  }
  try {
    const row = await findUserById(session.id);
    if (!row || !row.active) {
      return c.json(fail("UNAUTHORIZED", "Sesión inválida"), 401);
    }
    return c.json(ok({ user: publicUser(row) }));
  } catch (err) {
    return c.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
      500,
    );
  }
});

authRoutes.post(
  "/forgot-password",
  zValidator("json", forgotSchema),
  async (c) => {
    const generic = ok({
      ok: true,
      message:
        "Si el correo existe, vas a recibir un enlace para restablecer la contraseña.",
    });

    if (!isMailConfigured()) {
      return c.json(
        fail(
          "SMTP_NOT_CONFIGURED",
          "El envío de mail no está configurado (SMTP_*).",
        ),
        503,
      );
    }

    const { email } = c.req.valid("json");
    try {
      await ensureBootstrapSuperadmin();
      const row = await findUserByEmail(email);
      // Misma respuesta si no existe (no filtrar emails)
      if (!row || !row.active) return c.json(generic);

      const { raw, hash } = createResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await saveResetToken({
        userId: row.id,
        tokenHash: hash,
        expiresAt,
      });

      const base = getEnv().APP_PUBLIC_URL.replace(/\/+$/, "");
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(raw)}`;
      await sendPasswordResetEmail({ to: row.email, resetUrl });
    } catch (err) {
      console.error("[auth] forgot-password", err);
      return c.json(
        fail(
          "MAIL_ERROR",
          err instanceof Error ? err.message : "No se pudo enviar el mail",
        ),
        500,
      );
    }

    return c.json(generic);
  },
);

authRoutes.post(
  "/reset-password",
  zValidator("json", resetSchema),
  async (c) => {
    const { token, password } = c.req.valid("json");
    if (!isStrongEnoughPassword(password)) {
      return c.json(
        fail("VALIDATION", "La contraseña debe tener al menos 8 caracteres"),
        400,
      );
    }

    try {
      const consumed = await consumeResetToken(hashToken(token));
      if (!consumed) {
        return c.json(
          fail("INVALID_TOKEN", "El enlace no es válido o expiró"),
          400,
        );
      }
      const passwordHash = await hashPassword(password);
      await updateUserPassword(consumed.userId, passwordHash, true);
      return c.json(ok({ ok: true }));
    } catch (err) {
      return c.json(
        fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
        500,
      );
    }
  },
);

authRoutes.post(
  "/change-password",
  requireSession,
  zValidator("json", changeSchema),
  async (c) => {
    const session = c.get("user");
    if (session.email === "internal@tooling") {
      return c.json(fail("FORBIDDEN", "Usuario tooling no tiene password"), 403);
    }

    const { currentPassword, newPassword } = c.req.valid("json");
    if (!isStrongEnoughPassword(newPassword)) {
      return c.json(
        fail("VALIDATION", "La contraseña debe tener al menos 8 caracteres"),
        400,
      );
    }

    try {
      const row = await findUserById(session.id);
      if (!row || !row.active) {
        return c.json(fail("UNAUTHORIZED", "Sesión inválida"), 401);
      }
      const okCurrent = await verifyPassword(currentPassword, row.password_hash);
      if (!okCurrent) {
        return c.json(fail("UNAUTHORIZED", "Contraseña actual incorrecta"), 401);
      }
      const passwordHash = await hashPassword(newPassword);
      await updateUserPassword(row.id, passwordHash, true);
      const refreshed = await findUserById(row.id);
      if (!refreshed) {
        return c.json(ok({ ok: true }));
      }
      const user = toSession(refreshed);
      const token = createSessionToken(user);
      return c.json(ok({ ok: true, token, user: publicUser(refreshed) }));
    } catch (err) {
      return c.json(
        fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
        500,
      );
    }
  },
);

/** Listar usuarios internos (solo superadmin). */
authRoutes.get("/users", requireSession, requireRole("superadmin"), async (c) => {
  try {
    const rows = await listAppUsers();
    return c.json(ok({ users: rows.map(publicUser) }));
  } catch (err) {
    return c.json(
      fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
      500,
    );
  }
});

/** Crear usuario interno (solo superadmin). Solo rol admin. */
authRoutes.post(
  "/users",
  requireSession,
  requireRole("superadmin"),
  zValidator("json", createUserSchema),
  async (c) => {
    const { email, password } = c.req.valid("json");
    if (!isStrongEnoughPassword(password)) {
      return c.json(
        fail("VALIDATION", "La contraseña debe tener al menos 8 caracteres"),
        400,
      );
    }
    try {
      const existing = await findUserByEmail(email);
      if (existing) {
        return c.json(fail("CONFLICT", "Ese email ya está registrado"), 409);
      }
      const row = await createAppUser({
        email,
        password,
        role: "admin",
        mustChangePassword: true,
      });
      return c.json(ok({ user: publicUser(row) }), 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "DB error";
      if (message.includes("Solo puede existir un superadmin")) {
        return c.json(fail("CONFLICT", message), 409);
      }
      return c.json(fail("DB_ERROR", message), 500);
    }
  },
);

/** Eliminar admin (solo superadmin). No se puede borrar al superadmin ni a uno mismo. */
authRoutes.delete(
  "/users/:id",
  requireSession,
  requireRole("superadmin"),
  async (c) => {
    const session = c.get("user");
    const id = c.req.param("id");
    if (!id) {
      return c.json(fail("VALIDATION", "id requerido"), 400);
    }
    if (id === session.id) {
      return c.json(fail("FORBIDDEN", "No podés eliminarte a vos misma"), 403);
    }
    try {
      const target = await findUserById(id);
      if (!target) {
        return c.json(fail("NOT_FOUND", "Usuario no encontrado"), 404);
      }
      if (target.role === "superadmin") {
        return c.json(
          fail("FORBIDDEN", "No se puede eliminar al superadmin"),
          403,
        );
      }
      await deleteAppUser(id);
      return c.json(ok({ ok: true }));
    } catch (err) {
      return c.json(
        fail("DB_ERROR", err instanceof Error ? err.message : "DB error"),
        500,
      );
    }
  },
);
