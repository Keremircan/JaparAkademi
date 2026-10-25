/** Sistem rolleri (SPEC Bölüm 2.1). Bir kullanıcı birden çok role sahip olabilir. */
export const ROLES = [
  "personnel",
  "trainer",
  "section_manager",
  "ohs_specialist",
  "hr",
  "security",
  "sysadmin",
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
