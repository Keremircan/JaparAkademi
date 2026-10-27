import { env } from "@/server/env";
import { logger } from "@/server/logger";

/**
 * E-posta gönderimi (SPEC 11.1, 15): Microsoft Graph `Mail.Send` (uygulama izni, istemci kimlik bilgileri).
 * Kurumun M365 kiracısı tek yurt dışı istisnasıdır (yalnızca e-posta). Geliştirme/testte "log" sürücüsü
 * e-postayı göndermez, yalnızca alıcı ve konuyu loga yazar (karar #87).
 */

export type MailMessage = { to: string; subject: string; html: string; text: string };

export class MailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

let token: { value: string; expiresAt: number } | null = null;

async function graphToken(): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const e = env();
  const res = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.GRAPH_TENANT_ID!)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: e.GRAPH_CLIENT_ID!,
      client_secret: e.GRAPH_CLIENT_SECRET!,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new MailError(`Graph token alınamadı (${res.status})`, res.status >= 500 || res.status === 429);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const e = env();
  if (e.MAIL_TRANSPORT === "log") {
    // Adres ve gövde loga yazılmaz (kişisel veri); yalnızca konu
    logger.info({ subject: message.subject }, "E-posta (log sürücüsü, gönderilmedi)");
    return;
  }
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(e.MAIL_FROM!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
      saveToSentItems: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status === 401) token = null;
  if (!res.ok) throw new MailError(`Graph sendMail başarısız (${res.status})`, res.status >= 500 || res.status === 429 || res.status === 401);
}
