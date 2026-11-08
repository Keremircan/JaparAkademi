import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./global-setup";
import { acceptConsentIfAsked, login } from "./helpers";

/**
 * İş paketi 3.13 KVKK uyumu: "Gizlilik ve çerezler" sayfası (karar #278), "Bu cihazda oturumum açık kalsın"
 * (karar #280) ve açık rıza "veriyorum / vermiyorum" seçimi (karar #281).
 */
test("FG-1.6 gizlilik ve çerezler girişten önce okunur; giriş ekranı çerez yazmaz (karar #278)", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Gizlilik ve çerezler" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Gizlilik ve çerezler" })).toBeVisible();

  // E2E kurulumu çalışan ve ziyaretçi aydınlatma metinlerini ve açık rıza metnini yayınlar
  for (const id of ["kvkk_personnel", "explicit_consent_personnel", "kvkk_visitor"]) {
    const section = page.locator(`#${id}`);
    await expect(section.getByText(/^Sürüm \d+ · /)).toBeVisible();
  }
  const personnel = page.locator("#kvkk_personnel");
  await personnel.locator("summary").click();
  await expect(personnel.locator("details > div")).toBeVisible();

  // Çerez listesi; giriş yapılmadan hiçbir çerez yazılmamıştır
  await page.getByRole("link", { name: "Çerezler ve cihazınızda tutulan bilgiler" }).click();
  await expect(page.getByText("akademi.session_token")).toBeVisible();
  expect(await page.context().cookies()).toEqual([]);

  // İngilizce sayfa
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Privacy and cookies" })).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("FG-1.6 oturumum açık kalsın: kalıcı çerez yalnızca seçilince; açık rıza seçimi zorunlu (kararlar #280–281)", async ({ page }, testInfo) => {
  // Varsayılan kutu boş
  await page.goto("/login");
  await expect(page.getByRole("checkbox", { name: /Bu cihazda oturumum açık kalsın/ })).not.toBeChecked();

  // Kutu işaretli giriş (yardımcı işaretler): oturum çerezi kalıcıdır
  await login(page, `E2E-${process.env.E2E_SUFFIX}-PRV${testInfo.project.name[0]}`, E2E_PASSWORD);
  await expect(page).toHaveURL(/\/consent$/);
  const sessionCookie = (await page.context().cookies()).find((c) => c.name.endsWith("akademi.session_token"));
  expect(sessionCookie?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 300 * 24 * 60 * 60);

  // Açık rıza: hiçbir seçenek önceden seçili değil; seçmeden devam edilmez
  const give = page.getByRole("radio", { name: /Açık rıza veriyorum/ });
  const refuse = page.getByRole("radio", { name: /Açık rıza vermiyorum/ });
  await expect(give).not.toBeChecked();
  await expect(refuse).not.toBeChecked();
  await page.getByRole("button", { name: "Okudum, bilgilendirildim" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "seçeneklerinden birini seçin" })).toBeVisible();
  await expect(page).toHaveURL(/\/consent$/);

  // "Vermiyorum" seçilince uygulamaya girilir; profilde fotoğraf eklenemez, rıza verilebilir
  await refuse.check();
  await expect(page.getByRole("alert").filter({ hasText: "seçeneklerinden birini seçin" })).toHaveCount(0);
  await acceptConsentIfAsked(page);
  await page.goto("/profile");
  await expect(page.getByRole("button", { name: "Açık rıza ver", exact: true })).toBeVisible();
  // Kalıcı oturumda kısa oturum uyarısı yok
  await expect(page.getByText(/seçilmeden ya da ortak cihazda açıldı/)).toHaveCount(0);
});
