import type { SettingKey } from "./registry";

/**
 * Parametre ekranı kataloğu (iş paketi 2.1, kararlar #117–119): her parametrenin grubu ve
 * ekranda hangi alanla düzenlendiği. Doğrulama her zaman registry'deki Zod şemasıyla yapılır.
 * Katalogda olmayan parametre ekranda görünmez (ör. imza yetkilileri kendi ekranında yönetilir).
 */
export type SettingInput =
  | { kind: "int" }
  | { kind: "decimal"; step: number }
  | { kind: "boolean" }
  | { kind: "hazardClass" }
  | { kind: "perHazardClass" }
  | { kind: "events"; channel: "email" | "push" }
  | { kind: "visitorTypes" }
  | { kind: "list" }
  | { kind: "readonly" };

export const SETTING_GROUPS = ["org", "ohs", "visitors", "exam", "training", "auth", "notify", "certificate", "reports", "upload", "retention"] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

type Entry = { group: SettingGroup; input: SettingInput; requireNote?: boolean };

const int = { kind: "int" } as const;

export const SETTINGS_CATALOG: Partial<Record<SettingKey, Entry>> = {
  // Saat dilimi değişirse geçmiş tarih hesapları kayar; ekranda salt okunur (karar #117)
  "org.timezone": { group: "org", input: { kind: "readonly" } },

  "ohs.hazard_class": { group: "ohs", input: { kind: "hazardClass" } },
  "ohs.hours_by_class": { group: "ohs", input: { kind: "perHazardClass" } },
  "ohs.renewal_years_by_class": { group: "ohs", input: { kind: "perHazardClass" } },
  // Ziyaretçi tipleri tablo olarak düzenlenir (karar #126)
  "visitor.types": { group: "ohs", input: { kind: "visitorTypes" } },
  "visitor.ppe_items": { group: "ohs", input: { kind: "list" } },

  "visitor.code_max_attempts": { group: "visitors", input: int },
  "visitor.code_window_min": { group: "visitors", input: int },
  "visitor.selfreg_max": { group: "visitors", input: int },
  "visitor.selfreg_window_min": { group: "visitors", input: int },
  "visitor.kiosk_reset_seconds": { group: "visitors", input: int },

  "exam.theory.question_count": { group: "exam", input: int },
  "exam.theory.duration_min": { group: "exam", input: int },
  "exam.theory.pass_score": { group: "exam", input: int },
  "exam.theory.max_attempts": { group: "exam", input: int },
  "exam.theory.cooldown_hours": { group: "exam", input: int },
  "exam.theory.proctor_required": { group: "exam", input: { kind: "boolean" } },
  "exam.practical.pass_score": { group: "exam", input: int },
  "exam.practical.max_attempts": { group: "exam", input: int },
  "exam.question_pool_min_ratio": { group: "exam", input: { kind: "decimal", step: 0.5 } },
  "proctor.code_ttl_min": { group: "exam", input: int },
  "proctor.code_max_failures": { group: "exam", input: int },
  "proctor.code_lock_min": { group: "exam", input: int },
  "decision.extra_attempts_default": { group: "exam", input: int },

  "theory.video_watch_ratio": { group: "training", input: { kind: "decimal", step: 0.05 } },
  "assignment.daily_training_minutes": { group: "training", input: int },
  "recert.lead_days": { group: "training", input: int },
  "reread.due_days": { group: "training", input: int },
  "trainer.unmarked_alert_days": { group: "training", input: int },
  "content.review_max_age_months": { group: "training", input: int },

  "session.shared_idle_min": { group: "auth", input: int },
  "session.personal_days": { group: "auth", input: int },
  "auth.password_min_length": { group: "auth", input: int },
  "auth.lockout_attempts": { group: "auth", input: int },
  "auth.lockout_min": { group: "auth", input: int },
  "auth.ip_max_failures": { group: "auth", input: int },
  "auth.ip_window_min": { group: "auth", input: int },
  "auth.reset_link_minutes": { group: "auth", input: int },
  "auth.reset_max_per_hour": { group: "auth", input: int },
  "auth.invite_valid_hours": { group: "auth", input: int },
  "auth.invite_code_attempts": { group: "auth", input: int },

  // Olay × kanal: uygulama içi her zaman, e-posta seçilen olaylarda (karar #119)
  "notify.email_events": { group: "notify", input: { kind: "events", channel: "email" } },
  "notify.push_events": { group: "notify", input: { kind: "events", channel: "push" } },
  "notify.retention_days": { group: "notify", input: int },
  "mail.max_attempts": { group: "notify", input: int },
  "push.max_attempts": { group: "notify", input: int },
  "push.ttl_hours": { group: "notify", input: int },

  "verify.ip_max_requests": { group: "certificate", input: int },
  "verify.ip_window_min": { group: "certificate", input: int },

  "reports.max_rows": { group: "reports", input: int },

  "upload.max_video_mb": { group: "upload", input: int },
  "upload.max_pdf_mb": { group: "upload", input: int },
  "upload.max_image_mb": { group: "upload", input: int },

  // Saklama süreleri hukuk onayıyla değişir: gerekçe zorunlu (karar #118)
  "retention.personnel_years_after_exit": { group: "retention", input: int, requireNote: true },
  "retention.visitor_years": { group: "retention", input: int, requireNote: true },
  "retention.contractor_years": { group: "retention", input: int, requireNote: true },
  "retention.blacklist_years_after_lift": { group: "retention", input: int, requireNote: true },
  "retention.audit_years": { group: "retention", input: int, requireNote: true },
};
