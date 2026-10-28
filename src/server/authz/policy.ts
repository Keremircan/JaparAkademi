import { ForbiddenError } from "@/server/errors";
import type { Actor, UserActor } from "./actor";
import type { Role } from "./roles";

/**
 * Rol bazlı yetkiler (SPEC Bölüm 2.3). Kapsam kontrolleri (org ağacı, atanmış kursiyer)
 * bunlara ek olarak ilgili serviste yapılır; org ağacıyla birlikte iş paketi 1.1'de eklenir.
 */
export const PERMISSIONS = {
  // Sistem
  // Parametreler ekranı: her parametreyi yalnızca yöneten rol görür (registry managedBy, karar #117)
  "settings.view": ["sysadmin", "ohs_specialist"],
  "audit.view": ["sysadmin"],
  "roles.manage": ["sysadmin"],
  // Organizasyon ve personel
  "org.manage": ["hr", "sysadmin"],
  "people.view": ["hr", "sysadmin"],
  "people.manage": ["hr", "sysadmin"],
  "people.view_national_id": ["hr"],
  // KVKK aydınlatma metinleri (karar: İK yönetir)
  "legal.manage": ["hr"],
  "devices.manage": ["sysadmin"],
  // Eğitim atamaları: başlatma, eğitmen ve hedef tarih, iptal (FG-3.2)
  "assignments.manage": ["hr"],
  // İçerik ve pozisyon kartı
  "content.draft": ["trainer", "section_manager", "ohs_specialist", "hr"],
  "content.approve_section": ["section_manager", "hr"],
  "content.approve_ohs": ["ohs_specialist"],
  // Soru bankası
  "questions.view": ["section_manager", "ohs_specialist", "hr"],
  "questions.edit": ["section_manager", "ohs_specialist"],
  // Eğitim ve değerlendirme
  "proctor.issue_code": ["trainer", "section_manager", "ohs_specialist", "hr"],
  "practice.mark": ["trainer", "section_manager"],
  "practice.second_signature": ["section_manager"],
  "readiness.decide": ["section_manager"],
  // Tüm haklar bitince karar (SPEC 3.1, karar #76) ve sertifika (FG-7.2)
  "process.decide": ["section_manager", "hr"],
  "certificates.issue": ["section_manager", "hr"],
  "certificates.revoke": ["hr"],
  // Belge şablonu: imza yetkilileri (karar #79)
  "certificates.template": ["hr", "sysadmin"],
  "classroom.record": ["trainer", "section_manager", "ohs_specialist", "hr"],
  // Raporlar
  "reports.view": ["section_manager", "ohs_specialist", "hr", "security", "sysadmin"],
  // Faz 1 raporları (SPEC 10.1, karar #91): eğitim ve sınav İK + bölüm sorumlusu (kapsam), İSG defteri İSG + İK, işe başlama süresi İK
  "reports.training": ["section_manager", "hr"],
  "reports.exams": ["section_manager", "hr"],
  "reports.ohs": ["ohs_specialist", "hr"],
  "reports.onboarding": ["hr"],
  // KVKK kişi verisi dışa aktarma (SPEC 13.3, karar #99)
  "people.export_personal": ["hr"],
  // Ziyaretçi (Faz 2, iş paketi 2.2, kararlar #128–131). Ev sahibi olarak ön kayıt her personele açıktır.
  "visits.manage_all": ["security"],
  "visits.view_all": ["security", "ohs_specialist"],
  "visitor_briefings.manage": ["ohs_specialist"],
  "contractors.manage": ["ohs_specialist", "security"],
  "blacklist.manage": ["ohs_specialist", "security"],
  "legal.visitor_rules": ["ohs_specialist"],
  // Tahliye yoklaması ve ziyaretçi raporları (iş paketi 2.4, kararlar #162–163)
  "evacuation.manage": ["security", "ohs_specialist"],
  "reports.visitors": ["security", "ohs_specialist"],
  "reports.contractors": ["ohs_specialist", "hr"],
  "reports.expiring": ["ohs_specialist", "hr"],
  "reports.content": ["section_manager", "hr"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function hasRole(actor: Actor, role: Role): boolean {
  return actor.kind === "user" && actor.roles.includes(role);
}

export function hasAnyRole(actor: Actor, roles: readonly Role[]): boolean {
  return actor.kind === "user" && actor.roles.some((r) => roles.includes(r));
}

/** Sistem aktörü (seed, worker) tüm yetkilere sahiptir; kullanıcı aktörü rollerine göre. */
export function can(actor: Actor, permission: Permission): boolean {
  if (actor.kind === "system") return true;
  const allowed: readonly Role[] = PERMISSIONS[permission];
  return actor.roles.some((r) => allowed.includes(r));
}

export function assertCan(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) throw new ForbiddenError(permission);
}

/** Kimse kendi kaydını değerlendiremez veya onaylayamaz (SPEC 2.4). */
export function assertNotSelf(actor: Actor, targetUserId: string): void {
  if (actor.kind === "user" && actor.userId === targetUserId) {
    throw new ForbiddenError("self_action");
  }
}

export function assertUser(actor: Actor): asserts actor is UserActor {
  if (actor.kind !== "user") throw new ForbiddenError("user_required");
}
