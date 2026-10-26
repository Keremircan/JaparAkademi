import { expect, type Page } from "@playwright/test";

export async function login(page: Page, sicil: string, password: string, opts: { sharedDevice?: boolean } = {}) {
  await page.goto("/login");
  await page.getByLabel("Sicil no").fill(sicil);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  if (opts.sharedDevice) await page.getByRole("checkbox", { name: /Ortak cihaz/ }).click();
  await page.getByRole("button", { name: "Giriş yap" }).click();
}

export async function changePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Mevcut şifre").fill(current);
  await page.getByLabel("Yeni şifre", { exact: true }).fill(next);
  await page.getByLabel("Yeni şifre (tekrar)").fill(next);
  await page.getByRole("button", { name: "Şifreyi değiştir" }).click();
}

/**
 * KVKK onayı gelirse onaylar (yayınlanmış metin varsa her yeni kullanıcıda gelir).
 * Girişten sonra sunucu birden fazla kez yönlendirebilir (/ → /consent); adres yerine
 * son ekranı bekler: onay butonu ya da uygulama kabuğundaki sayfa başlığı.
 */
export async function acceptConsentIfAsked(page: Page) {
  const consent = page.getByRole("button", { name: "Okudum, onaylıyorum" });
  const appHeading = page.locator("#main h1");
  await expect(consent.or(appHeading).first()).toBeVisible({ timeout: 15_000 });
  if (await consent.isVisible()) {
    await consent.click();
    await expect(appHeading.first()).toBeVisible({ timeout: 15_000 });
  }
}
