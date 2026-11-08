import { expect, type Page } from "@playwright/test";

/**
 * Giriş. Varsayılan "Bu cihazda oturumum açık kalsın" işaretlenir (kişisel cihaz); `sharedDevice` kutuyu boş bırakır:
 * oturum kısa (ortak) modda açılır (karar #280).
 */
export async function login(page: Page, sicil: string, password: string, opts: { sharedDevice?: boolean } = {}) {
  await page.goto("/login");
  await page.getByLabel("Sicil no").fill(sicil);
  await page.getByLabel("Şifre", { exact: true }).fill(password);
  if (!opts.sharedDevice) await page.getByRole("checkbox", { name: /oturumum açık kalsın/ }).click();
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
  // Aydınlatma bekliyorsa "Okudum, bilgilendirildim", yalnızca açık rıza bekliyorsa "Kaydet ve devam et"
  const consent = page.getByRole("button", { name: /^(Okudum, bilgilendirildim|Kaydet ve devam et)$/ });
  const appHeading = page.locator("#main h1");
  await expect(consent.or(appHeading).first()).toBeVisible({ timeout: 15_000 });
  if (await consent.isVisible()) {
    // Açık rıza metni yayındaysa karar zorunlu (karar #281): testler rıza vermez
    const refuse = page.getByRole("radio", { name: /Açık rıza vermiyorum/ });
    if (await refuse.isVisible()) await refuse.check();
    await consent.click();
    await expect(appHeading.first()).toBeVisible({ timeout: 15_000 });
  }
}
