import nodemailer from "nodemailer";
import { getEnv } from "../env";

export function isMailConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function smtpPass(): string {
  const raw = getEnv().SMTP_PASS ?? "";
  return raw.replace(/\s+/g, "");
}

export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  const env = getEnv();
  if (!isMailConfigured()) {
    throw new Error("SMTP no configurado (SMTP_HOST / SMTP_USER / SMTP_PASS)");
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: smtpPass(),
    },
  });

  const from = env.SMTP_FROM || env.SMTP_USER || "noreply@localhost";

  await transporter.sendMail({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  resetUrl: string;
}): Promise<void> {
  const subject = "Cool Meals Ops — restablecer contraseña";
  const text = [
    "Recibimos un pedido para restablecer tu contraseña del panel Cool Meals Ops.",
    "",
    `Abrí este enlace (válido ~60 minutos):`,
    input.resetUrl,
    "",
    "Si no pediste esto, ignorá el mensaje.",
    "",
    "— Enviado desde Symbionet para Cool Meals",
  ].join("\n");

  const html = `
    <p>Recibimos un pedido para restablecer tu contraseña del panel <strong>Cool Meals Ops</strong>.</p>
    <p><a href="${input.resetUrl}">Restablecer contraseña</a></p>
    <p style="color:#666;font-size:13px">El enlace vale ~60 minutos. Si no pediste esto, ignorá el mensaje.</p>
  `;

  await sendMail({ to: input.to, subject, text, html });
}
