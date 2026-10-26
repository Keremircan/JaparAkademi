import { expect, test } from "@playwright/test";
import { E2E_NEW_PASSWORD, E2E_PASSWORD } from "./global-setup";

function sicilFor(projectName: string) {
  return `E2E-${process.env.E2E_SUFFIX}-${projectName[0]}`;
}

test("oturum yokken korumalı sayfa giriş sayfasına yönlendirir", async ({ page }) => {
  await page.goto("/trainer");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Giriş yap" })).toBeVisible();
});

test("yanlış şifrede genel hata mesajı gösterilir", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByLabel("Sicil no").fill(sicilFor(testInfo.project.name));
  await page.getByLabel("Şifre", { exact: true }).fill("yanlis-sifre");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  // Next'in rota duyurucusu da role="alert" taşır; mesaj metniyle süzülür
  await expect(page.getByRole("alert").filter({ hasText: "Sicil no veya şifre hatalı." })).toBeVisible();
});

test("ilk giriş → şifre değiştir → rol menüsü → çıkış", async ({ page }, testInfo) => {
  const sicil = sicilFor(testInfo.project.name);

  await page.goto("/login");
  await page.getByLabel("Sicil no").fill(sicil);
  await page.getByLabel("Şifre", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("checkbox", { name: /Ortak cihaz/ }).click();
  await page.getByRole("button", { name: "Giriş yap" }).click();

  // İlk girişte şifre değiştirme zorunlu
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByText("İlk girişiniz olduğu için")).toBeVisible();
  await page.getByLabel("Mevcut şifre").fill(E2E_PASSWORD);
  await page.getByLabel("Yeni şifre", { exact: true }).fill(E2E_NEW_PASSWORD);
  await page.getByLabel("Yeni şifre (tekrar)").fill(E2E_NEW_PASSWORD);
  await page.getByRole("button", { name: "Şifreyi değiştir" }).click();

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
  await page.getByRole("main").getByRole("button", { name: "Çıkış yap" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
