import { env, type ServerEnv } from "@/server/env";
import { logger } from "@/server/logger";
import { classifyFetchError, classifyGraphError, classifyResendError, type MailProblem } from "@/server/state/mail";

/**
 * E-posta gönderimi (SPEC 11.1, 15). Sürücüler:
 * - `resend`: Resend API (iş paketi 3.7, karar #258; kişisel veri istisnası CLAUDE.md'de),
 * - `graph`: Microsoft Graph `Mail.Send` (kurumun M365 kiracısı; yedek seçenek),
 * - `log`: geliştirme/test; e-posta gönderilmez, yalnızca konu loga yazılır (karar #87).
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Aynı isteğin iki kez gönderilmesini önler (Resend, 24 saat). */
  idempotencyKey?: string;
};

export type MailTransport = ServerEnv["MAIL_TRANSPORT"];

export class MailError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly problem: MailProblem = "unknown",
  ) {
    super(message);
  }
}

export function mailTransport(): MailTransport {
  return env().MAIL_TRANSPORT;
}

/** E-posta gerçekten gönderiliyor mu (davet kanalı, "Şifremi unuttum" ve durum ekranı buna bakar). */
export function mailEnabled(): boolean {
  return env().MAIL_TRANSPORT !== "log";
}

/** Gönderen satırı: `JAPAR Akademi <akademi@...>`; adres tanımlı değilse null. */
export function mailSender(): string | null {
  const e = env();
  if (!e.MAIL_FROM) return null;
  return e.MAIL_TRANSPORT === "resend" ? `${e.MAIL_FROM_NAME ?? "JAPAR Akademi"} <${e.MAIL_FROM}>` : e.MAIL_FROM;
}

/** Ağ hatası (DNS, güvenlik duvarı, zaman aşımı) yeniden denenebilir hataya çevrilir; ekrana yalnızca hata kodu yazılır. */
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const info = classifyFetchError(err);
    logger.warn({ host: new URL(url).host, code: info.code }, "E-posta servisine istek gönderilemedi");
    const detail = info.code === "INVALID_HEADER" ? "API anahtarında geçersiz karakter" : "Bağlantı kurulamadı";
    throw new MailError(`${detail} (${info.code})`, info.retryable, info.problem);
  }
}

// ---- Resend ----

/** Hata gövdesinden yalnızca hata adı alınır (metin adres içerebilir). */
async function resendErrorName(res: Response): Promise<string | undefined> {
  const body = (await res.json().catch(() => null)) as { name?: unknown } | null;
  return typeof body?.name === "string" && /^[a-z_]{1,64}$/.test(body.name) ? body.name : undefined;
}

async function sendWithResend(e: ServerEnv, message: MailMessage): Promise<void> {
  const res = await request("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${e.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": "japar-akademi",
      ...(message.idempotencyKey ? { "Idempotency-Key": message.idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: mailSender(), to: [message.to], subject: message.subject, html: message.html, text: message.text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (res.ok) return;
  const name = await resendErrorName(res);
  const info = classifyResendError(res.status, name);
  throw new MailError(`Resend ${res.status}${name ? ` ${name}` : ""}`, info.retryable, info.problem);
}

// ---- Microsoft Graph ----

let token: { value: string; expiresAt: number } | null = null;

async function graphToken(e: ServerEnv): Promise<string> {
  if (token && token.expiresAt > Date.now() + 60_000) return token.value;
  const res = await request(`https://login.microsoftonline.com/${encodeURIComponent(e.GRAPH_TENANT_ID!)}/oauth2/v2.0/token`, {
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
  if (!res.ok) {
    const info = classifyGraphError("token", res.status);
    throw new MailError(`Graph token alınamadı (${res.status})`, info.retryable, info.problem);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function sendWithGraph(e: ServerEnv, message: MailMessage): Promise<void> {
  const res = await request(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(e.MAIL_FROM!)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await graphToken(e)}`, "Content-Type": "application/json" },
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
  if (!res.ok) {
    const info = classifyGraphError("send", res.status);
    throw new MailError(`Graph sendMail başarısız (${res.status})`, info.retryable, info.problem);
  }
}

export async function sendMail(message: MailMessage): Promise<void> {
  const e = env();
  if (e.MAIL_TRANSPORT === "log") {
    // Adres ve gövde loga yazılmaz (kişisel veri); yalnızca konu
    logger.info({ subject: message.subject }, "E-posta (log sürücüsü, gönderilmedi)");
    return;
  }
  if (e.MAIL_TRANSPORT === "resend") return sendWithResend(e, message);
  return sendWithGraph(e, message);
}
