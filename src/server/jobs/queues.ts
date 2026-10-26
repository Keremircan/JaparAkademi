/**
 * Kuyruk adları. Kuyruklar `npm run db:migrate` sırasında oluşturulur (uygulama worker'dan bağımsız iş gönderebilsin).
 * Bu dosya servis modülü içe aktarmamalıdır (migrate betiği kullanır).
 */
export const QUEUES = {
  /** Worker'ın ayakta olduğunu ve veritabanına eriştiğini doğrulayan periyodik iş. */
  heartbeat: "system.heartbeat",
  /** Onaylanmamış Excel aktarımlarının kişisel verisini 24 saat sonra siler (FG-1.4). */
  importsCleanup: "imports.cleanup",
  /** Yüklenen medyanın işlenmesi: görsel küçültme, PDF sayfa sayısı, video HLS (FG-2.1). */
  mediaProcess: "media.process",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Kuyruk ayarları: yeniden deneme ve süre sınırı. */
export const QUEUE_OPTIONS: Partial<Record<QueueName, { retryLimit: number; retryDelay: number; expireInSeconds: number }>> = {
  [QUEUES.mediaProcess]: { retryLimit: 2, retryDelay: 30, expireInSeconds: 2 * 60 * 60 },
};
