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
  /** Süresi dolan sınav denemesini verilen cevaplarla teslim eder (SPEC Bölüm 6). */
  examTimeout: "exam.timeout",
  /** Sertifika / katılım belgesi PDF'i (FG-7.2). Kayıt düzenlendiği transaction'dan önce işlenirse yeniden denenir. */
  certificateRender: "certificate.render",
  /** E-posta kuyruğunu gönderir (dakikada bir; SPEC 10.2). */
  mailDispatch: "mail.dispatch",
  /** Saklama süresi dolan bildirimleri siler (günlük). */
  notificationsPurge: "notifications.purge",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Kuyruk ayarları: yeniden deneme ve süre sınırı. */
export const QUEUE_OPTIONS: Partial<Record<QueueName, { retryLimit: number; retryDelay: number; expireInSeconds: number }>> = {
  [QUEUES.mediaProcess]: { retryLimit: 2, retryDelay: 30, expireInSeconds: 2 * 60 * 60 },
  [QUEUES.examTimeout]: { retryLimit: 5, retryDelay: 30, expireInSeconds: 10 * 60 },
  [QUEUES.certificateRender]: { retryLimit: 5, retryDelay: 10, expireInSeconds: 10 * 60 },
};
