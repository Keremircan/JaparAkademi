import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

const sicil = (kind: string, projectName: string) => `E2E-${process.env.E2E_SUFFIX}-${kind}${projectName[0]}`;

test("SPEC 10.2 zil okunmamış sayıyı gösterir; bildirime dokununca ilgili ekran açılır ve okundu olur", async ({ page }, testInfo) => {
  const p = testInfo.project.name[0];
  await login(page, sicil("TR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  const bell = page.getByRole("link", { name: /^Bildirimler \(\d+ okunmamış\)$/ }).filter({ visible: true });
  await expect(bell).toBeVisible();
  await bell.click();
  await page.waitForURL(/\/notifications$/);
  const item = page.getByRole("button", { name: new RegExp(`Deneme Pratik Kursiyeri ${p} size kursiyer olarak atandı`) });
  await expect(item).toBeVisible();
  await item.click();
  await page.waitForURL(/\/trainer$/);

  await page.goto("/notifications");
  await expect(page.getByRole("button", { name: new RegExp(`Deneme Pratik Kursiyeri ${p} size kursiyer olarak atandı`) }).getByLabel("Okunmamış")).toHaveCount(0);
});

test("SPEC 11.4 şifremi unuttum: sicil girilince aynı genel mesaj gösterilir", async ({ page }, testInfo) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Şifremi unuttum" }).click();
  await page.waitForURL(/\/forgot-password$/);
  await page.getByLabel("Sicil no").fill(sicil("HR", testInfo.project.name));
  await page.getByRole("button", { name: "Bağlantı gönder" }).click();
  await expect(page.getByText(/İsteğiniz alındı/)).toBeVisible();

  // Geçersiz bağlantı açık bir mesaj gösterir
  await page.goto(`/reset-password/${"x".repeat(43)}`);
  await expect(page.getByText("Bu bağlantı geçersiz ya da süresi dolmuş.")).toBeVisible();
});

test("karar #177, #181: kişisel cihazda profilde 'Bu cihazda bildirimler' bölümü ve durumu görünür", async ({ page }, testInfo) => {
  await login(page, sicil("TR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);
  await page.goto("/profile");
  const section = page.getByRole("region", { name: "Bu cihazda bildirimler" }).filter({ visible: true });
  await expect(section).toBeVisible();
  // Sunucu ve tarayıcıya göre: aç düğmesi ya da nedenini anlatan açıklama (geliştirmede service worker kapalı)
  await expect(section.getByRole("button", { name: "Bildirimleri aç" }).or(section.getByRole("status")).first()).toBeVisible();
});
