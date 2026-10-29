import { z } from "zod";
import type { Role } from "@/server/authz/roles";
import { DEFAULT_EMAIL_EVENTS, NOTIFICATION_KINDS } from "@/server/state/notifications";

/**
 * Parametre kaydı (SPEC Bölüm 14). Kodda eşik/süre sabit yazılmaz; buradan okunur.
 * - schema      : değerin doğrulaması
 * - default     : veritabanında kayıt yoksa kullanılan değer
 * - managedBy   : değiştirebilecek roller
 * - planOverride: eğitim planı bazında geçersiz kılınabilir mi (iş paketi 1.3)
 */
type SettingDef<S extends z.ZodType> = {
  schema: S;
  default: z.infer<S>;
  managedBy: readonly Role[];
  planOverride?: boolean;
};

function def<S extends z.ZodType>(d: SettingDef<S>): SettingDef<S> {
  return d;
}

const positiveInt = z.number().int().positive();
const score = z.number().int().min(0).max(100);
const SYS = ["sysadmin"] as const satisfies readonly Role[];
const OHS = ["ohs_specialist"] as const satisfies readonly Role[];

export const hazardClass = z.enum(["low", "medium", "high"]);
const perHazardClass = z.object({ low: positiveInt, medium: positiveInt, high: positiveInt });

/**
 * Ziyaretçi tipi ayarları (SPEC 8.1, karar #126). validityYears = 0: yalnızca ziyaret günü geçerli.
 * questionCount = 0: kontrol sorusu yok, onay yeterli.
 */
const visitorTypeSettings = z.object({
  enabled: z.boolean(),
  questionCount: z.number().int().min(0).max(50),
  passScore: z.number().int().min(0).max(100),
  cardMinSeconds: z.number().int().min(0).max(600),
  validityYears: z.number().int().min(0).max(10),
});
export const visitorTypesSchema = z.object({ office: visitorTypeSettings, site: visitorTypeSettings, contractor: visitorTypeSettings });
export type VisitorTypeSettings = z.infer<typeof visitorTypeSettings>;

export const SETTINGS = {
  "org.timezone": def({ schema: z.string().min(1), default: "Europe/Istanbul", managedBy: SYS }),

  // İSG (6331 sayılı Kanun ve yönetmelik) — tehlike sınıfı ayarlanana kadar null ("tehlikeli" kabul edilir)
  "ohs.hazard_class": def({ schema: hazardClass.nullable(), default: null, managedBy: OHS }),
  "ohs.hours_by_class": def({ schema: perHazardClass, default: { low: 8, medium: 12, high: 16 }, managedBy: OHS }),
  "ohs.renewal_years_by_class": def({ schema: perHazardClass, default: { low: 3, medium: 2, high: 1 }, managedBy: OHS }),

  // Teorik eğitim ve sınav
  "theory.video_watch_ratio": def({ schema: z.number().min(0.5).max(1), default: 0.9, managedBy: SYS, planOverride: true }),
  "exam.theory.question_count": def({ schema: positiveInt.max(200), default: 20, managedBy: SYS, planOverride: true }),
  "exam.theory.duration_min": def({ schema: positiveInt.max(600), default: 30, managedBy: SYS, planOverride: true }),
  "exam.theory.pass_score": def({ schema: score, default: 70, managedBy: SYS, planOverride: true }),
  "exam.theory.max_attempts": def({ schema: positiveInt.max(20), default: 3, managedBy: SYS, planOverride: true }),
  "exam.theory.cooldown_hours": def({ schema: z.number().int().min(0).max(720), default: 24, managedBy: SYS, planOverride: true }),
  "exam.theory.proctor_required": def({ schema: z.boolean(), default: true, managedBy: SYS, planOverride: true }),
  "exam.practical.pass_score": def({ schema: score, default: 80, managedBy: SYS, planOverride: true }),
  "exam.practical.max_attempts": def({ schema: positiveInt.max(20), default: 2, managedBy: SYS, planOverride: true }),
  // Atama: hedef tarih varsayılanı = işe giriş + plan süresi / günlük eğitim süresi (iş günü; hafta sonu hariç)
  "assignment.daily_training_minutes": def({ schema: positiveInt.max(1440), default: 420, managedBy: SYS }),
  "exam.question_pool_min_ratio": def({ schema: z.number().min(1).max(10), default: 2, managedBy: SYS }),
  "proctor.code_ttl_min": def({ schema: positiveInt.max(24 * 60), default: 120, managedBy: SYS }),
  // Hatalı gözetmen kodu: kursiyer başına sınır ve kilit süresi (karar #62)
  "proctor.code_max_failures": def({ schema: positiveInt.max(50), default: 5, managedBy: SYS }),
  "proctor.code_lock_min": def({ schema: positiveInt.max(1440), default: 15, managedBy: SYS }),

  // Oturum ve kimlik doğrulama
  "session.shared_idle_min": def({ schema: positiveInt.max(240), default: 10, managedBy: SYS }),
  "session.personal_days": def({ schema: positiveInt.max(365), default: 30, managedBy: SYS }),
  "auth.password_min_length": def({ schema: z.number().int().min(8).max(64), default: 8, managedBy: SYS }),
  "auth.lockout_attempts": def({ schema: positiveInt.max(50), default: 5, managedBy: SYS }),
  "auth.lockout_min": def({ schema: positiveInt.max(24 * 60), default: 15, managedBy: SYS }),
  "auth.ip_max_failures": def({ schema: positiveInt.max(1000), default: 20, managedBy: SYS }),
  "auth.ip_window_min": def({ schema: positiveInt.max(24 * 60), default: 15, managedBy: SYS }),

  // Sertifika ve doğrulama (FG-7.2, iş paketi 1.7)
  "certificate.signatories": def({
    schema: z.array(z.object({ name: z.string().min(2).max(100), title: z.string().min(2).max(100), signatureAssetId: z.uuid().nullable() })).max(3),
    default: [],
    managedBy: ["hr", "sysadmin"],
  }),
  "verify.ip_max_requests": def({ schema: positiveInt.max(10_000), default: 60, managedBy: SYS }),
  "verify.ip_window_min": def({ schema: positiveInt.max(24 * 60), default: 1, managedBy: SYS }),
  "decision.extra_attempts_default": def({ schema: positiveInt.max(10), default: 1, managedBy: SYS }),

  // Bildirim ve e-posta (SPEC 10.2, iş paketi 1.8a)
  "notify.email_events": def({ schema: z.array(z.enum(NOTIFICATION_KINDS)), default: DEFAULT_EMAIL_EVENTS, managedBy: SYS }),
  "notify.retention_days": def({ schema: positiveInt.max(3650), default: 180, managedBy: SYS }),
  "mail.max_attempts": def({ schema: positiveInt.max(20), default: 5, managedBy: SYS }),
  // Web push (iş paketi 2.6, karar #180): varsayılan bütün türler; push yalnızca "Yeni bildiriminiz var" taşır
  "notify.push_events": def({ schema: z.array(z.enum(NOTIFICATION_KINDS)), default: [...NOTIFICATION_KINDS], managedBy: SYS }),
  "push.max_attempts": def({ schema: positiveInt.max(10), default: 3, managedBy: SYS }),
  "push.ttl_hours": def({ schema: positiveInt.max(24 * 7), default: 24, managedBy: SYS }),
  "auth.reset_link_minutes": def({ schema: positiveInt.max(24 * 60), default: 60, managedBy: SYS }),
  "auth.reset_max_per_hour": def({ schema: positiveInt.max(100), default: 3, managedBy: SYS }),
  "auth.invite_valid_hours": def({ schema: positiveInt.max(24 * 30), default: 72, managedBy: SYS }),
  "auth.invite_code_attempts": def({ schema: positiveInt.max(20), default: 5, managedBy: SYS }),

  // Raporlar (SPEC 10.1, karar #96)
  "reports.max_rows": def({ schema: positiveInt.max(100_000), default: 10_000, managedBy: SYS }),

  // Süre ve hatırlatmalar
  "recert.lead_days": def({ schema: positiveInt.max(365), default: 30, managedBy: SYS }),
  "reread.due_days": def({ schema: positiveInt.max(365), default: 14, managedBy: SYS }),
  "trainer.unmarked_alert_days": def({ schema: positiveInt.max(60), default: 3, managedBy: SYS }),
  "content.review_max_age_months": def({ schema: positiveInt.max(60), default: 12, managedBy: SYS }),

  // Dosya yükleme sınırları (MB)
  "upload.max_video_mb": def({ schema: positiveInt.max(10_240), default: 2048, managedBy: SYS }),
  "upload.max_pdf_mb": def({ schema: positiveInt.max(1024), default: 50, managedBy: SYS }),
  "upload.max_image_mb": def({ schema: positiveInt.max(200), default: 15, managedBy: SYS }),

  // Ziyaretçi tipleri (SPEC 8.1): ofis onay yeterli; saha 3 soru hepsi doğru; taşeron 10 soru, 80 puan, 1 yıl
  "visitor.types": def({
    schema: visitorTypesSchema,
    default: {
      office: { enabled: true, questionCount: 0, passScore: 100, cardMinSeconds: 10, validityYears: 0 },
      site: { enabled: true, questionCount: 3, passScore: 100, cardMinSeconds: 15, validityYears: 0 },
      contractor: { enabled: true, questionCount: 10, passScore: 80, cardMinSeconds: 20, validityYears: 1 },
    },
    managedBy: OHS,
  }),

  // Kapıda verilen KKD listesi (iş paketi 2.3b, karar #149)
  "visitor.ppe_items": def({
    schema: z.array(z.string().trim().min(1).max(60)).max(20),
    default: ["Baret", "Reflektörlü yelek", "İş ayakkabısı", "Koruyucu gözlük", "Kulak koruyucu"],
    managedBy: OHS,
  }),

  // Ziyaretçi ekranları (iş paketi 2.3a): kiosk kodu ve kendi kaydı hız sınırları, kiosk başa dönme süresi
  "visitor.code_max_attempts": def({ schema: positiveInt.max(100), default: 10, managedBy: SYS }),
  "visitor.code_window_min": def({ schema: positiveInt.max(1440), default: 10, managedBy: SYS }),
  "visitor.selfreg_max": def({ schema: positiveInt.max(1000), default: 20, managedBy: SYS }),
  "visitor.selfreg_window_min": def({ schema: positiveInt.max(1440), default: 60, managedBy: SYS }),
  "visitor.kiosk_reset_seconds": def({ schema: z.number().int().min(5).max(600), default: 20, managedBy: SYS }),

  // Saklama süreleri (SPEC 12.3, hukuk teyidi gerekli)
  "retention.personnel_years_after_exit": def({ schema: positiveInt.max(50), default: 15, managedBy: SYS }),
  "retention.visitor_years": def({ schema: positiveInt.max(20), default: 2, managedBy: SYS }),
  "retention.contractor_years": def({ schema: positiveInt.max(20), default: 2, managedBy: SYS }),
  "retention.blacklist_years_after_lift": def({ schema: positiveInt.max(20), default: 2, managedBy: SYS }),
  "retention.audit_years": def({ schema: positiveInt.max(50), default: 15, managedBy: SYS }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]["schema"]>;

export function isSettingKey(key: string): key is SettingKey {
  return Object.hasOwn(SETTINGS, key);
}
