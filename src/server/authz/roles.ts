/** Sistem rolleri (SPEC Bölüm 2.1). Bir kullanıcı birden çok role sahip olabilir. */
export const ROLES = [
  "personnel",
  "trainer",
  "section_manager",
  "ohs_specialist",
  "hr",
  "security",
  "sysadmin",
  // Üst yönetici (karar #192): diğer bütün rollerin yetkileri
  "owner",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Oturumda geçerli roller: `owner` diğer bütün rolleri de taşır (menü, kapsam, yetki).
 * Kişinin kendi atanmış rolleri ayrıca saklanır (baseRoles): bildirim alıcıları ve mesleki imza uyarısı için.
 */
export function effectiveRoles(roles: readonly Role[]): Role[] {
  return roles.includes("owner") ? [...ROLES] : [...roles];
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
