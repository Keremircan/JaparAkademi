import { expect, test } from "@playwright/test";
import { E2E_PASSWORD } from "./global-setup";
import { acceptConsentIfAsked, login } from "./helpers";

const sicil = (projectName: string) => `E2E-${process.env.E2E_SUFFIX}-EN${projectName[0]}`;

test("karar #207–208 dil seçimi: İngilizce giriş ekranı, profilde dil tercihi, sonraki girişte tercih edilen dil", async ({ page }, testInfo) => {
  // Hesapsız ekranda dil bağlantısı
  await page.goto("/login");
  await page.getByRole("link", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Employee number").fill(sicil(testInfo.project.name));
  await page.getByLabel("Password", { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Hesabın tercihi henüz Türkçe: uygulama Türkçe açılır
  await acceptConsentIfAsked(page);
  await page.goto("/profile");
  const main = page.getByRole("main").filter({ visible: true });
  await main.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\/en\/profile$/);
  await expect(page.getByRole("heading", { name: "Profile", level: 1 })).toBeVisible();
  await expect(main.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  // Türkçe adres tercih edilen dile yönlendirilir
  await page.goto("/learn");
  await expect(page).toHaveURL(/\/en\/learn$/);
  await expect(page.getByRole("heading", { name: "My training", level: 1 })).toBeVisible();

  // Çıkış → Türkçe giriş ekranından girince hesabın dili (İngilizce) açılır
  await page.goto("/en/profile");
  await main.getByRole("button", { name: "Sign out" }).click();
  await login(page, sicil(testInfo.project.name), E2E_PASSWORD);
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { name: /^Hello, / })).toBeVisible();

  // Türkçeye dönüş
  await page.goto("/en/profile");
  await main.getByRole("button", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole("heading", { name: "Profil", level: 1 })).toBeVisible();
});
