import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@backend/lib/env";
import { logger } from "@backend/lib/logging/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter | undefined {
  if (!env.SMTP_HOST) return undefined;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/**
 * Sends an email via SMTP. When SMTP is not configured (development only —
 * production requires it, see src/lib/env.ts) the message is printed to the
 * server console so links can be followed locally.
 * Throws if delivery fails; callers decide how to surface that.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const transport = getTransporter();
  if (!transport) {
    if (env.NODE_ENV === "production") throw new Error("Email transport is not configured");
    console.info(`\n[dev-mail] To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`);
    return;
  }
  await transport.sendMail({ from: env.EMAIL_FROM, ...message });
  logger.info("Email sent", { subject: message.subject });
}
