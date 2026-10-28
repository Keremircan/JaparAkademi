/**
 * Bildirim türleri ve kuralları (SPEC 10.2, karar #84–90), saf fonksiyonlar.
 * Uygulama içi bildirim her olayda yazılır; e-posta yalnızca `notify.email_events` parametresindeki türler için.
 */

export const NOTIFICATION_KINDS = [
  // Kursiyer
  "assignment_started",
  "exam_available",
  "exam_result",
  "certificate_ready",
  // Eğitmen
  "trainee_assigned",
  "practical_exam_available",
  // Bölüm sorumlusu / İSG / İK
  "approval_pending",
  "second_signature_pending",
  "readiness_pending",
  "all_attempts_failed",
  // İSG uzmanı (Faz 2)
  "blacklist_added",
  "blacklist_denied",
  // Ev sahibi (Faz 2)
  "visitor_briefed",
  "visitor_arrived",
  // Sistem yöneticisi
  "email_failed",
  "retention_completed",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Varsayılan: sınav sonucu ve sistem alarmı yalnızca uygulama içi; diğerleri e-posta da (karar #85). */
export const DEFAULT_EMAIL_EVENTS: NotificationKind[] = NOTIFICATION_KINDS.filter(
  (k) => k !== "exam_result" && k !== "email_failed" && k !== "retention_completed",
);

/** Yeniden deneme bekleme süresi: 1, 5, 15, 60 dk… (üstel, en çok 6 saat). */
export function nextAttemptDelayMs(attempts: number): number {
  const minutes = [1, 5, 15, 60, 180, 360][Math.max(0, Math.min(attempts - 1, 5))]!;
  return minutes * 60_000;
}

/** E-posta için basit HTML (yalnızca başlık, kısa metin ve bağlantı; kişisel ayrıntı yok — karar #86). */
export function emailHtml(input: { heading: string; body: string; linkLabel: string; url: string; footer: string }): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return [
    '<!doctype html><html lang="tr"><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">',
    `<h1 style="font-size:20px">${esc(input.heading)}</h1>`,
    `<p>${esc(input.body)}</p>`,
    `<p><a href="${esc(input.url)}" style="display:inline-block;padding:12px 20px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px">${esc(input.linkLabel)}</a></p>`,
    `<p style="font-size:12px;color:#6b7280">${esc(input.footer)}</p>`,
    "</body></html>",
  ].join("");
}
