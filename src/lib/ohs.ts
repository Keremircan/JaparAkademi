/**
 * İSG eğitim konu grupları (Çalışanların İSG Eğitimlerinin Usul ve Esasları Yönetmeliği, karar #228):
 * genel, sağlık, teknik ve diğer konular. İSG modülüne İSG uzmanı atar; OSGB dosyasında sütun olarak çıkar.
 */
export const OHS_TOPICS = ["general", "health", "technical", "other"] as const;
export type OhsTopic = (typeof OHS_TOPICS)[number];
