import { expect, test } from "@playwright/test";
import { E2E_NEW_PASSWORD, E2E_PASSWORD } from "./global-setup";
import { acceptConsentIfAsked, changePassword, login } from "./helpers";

function sicilFor(projectName: string) {
  return `E2E-${process.env.E2E_SUFFIX}-${projectName[0]}`;
}

test("oturum yokken korumalı sayfa giriş sayfasına yönlendirir", async ({ page }) => {
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
});

test("yanlış şifrede genel hata mesajı gösterilir", async ({ page }, testInfo) => {
  await login(page, sicilFor(testInfo.project.name), "yanlis-sifre");
  // Next'in rota duyurucusu da role="alert" taşır; mesaj metniyle süzülür
  await expect(page.getByRole("alert").filter({ hasText: "Sicil no veya şifre hatalı." })).toBeVisible();
});

test("ilk giriş → şifre değiştir → KVKK onayı → rol menüsü → çıkış", async ({ page }, testInfo) => {
  await login(page, sicilFor(testInfo.project.name), E2E_PASSWORD, { sharedDevice: true });
  await expect(page.getByText("İlk girişiniz olduğu için")).toBeVisible();
  await changePassword(page, E2E_PASSWORD, E2E_NEW_PASSWORD);

  // KVKK aydınlatma metni onaylanmadan uygulamaya girilmez
  await expect(page).toHaveURL(/\/consent$/);
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/consent$/);
  await acceptConsentIfAsked(page);

  // Ana sayfa ve rollere göre menü (eğitmen + İK; güvenlik yok)
  await expect(page.getByRole("heading", { name: "Merhaba, Deneme Kullanıcı" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Eğitmen" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Sistem" })).toBeVisible();
  await expect(main.getByRole("link", { name: "Güvenlik" })).toHaveCount(0);

  // Yetkisi olmayan bölüm 404 görünümü verir
  await page.goto("/security");
  await expect(page.getByRole("heading", { name: "Sayfa bulunamadı" })).toBeVisible();

  // Profil: ortak cihaz modu ve çıkış
  await page.goto("/profile");
  await expect(page.getByText("ortak cihaz modunda")).toBeVisible();
  // Ortak cihazda push bölümü yok (karar #178)
  await expect(page.getByRole("heading", { name: "Bu cihazda bildirimler" })).toHaveCount(0);
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
