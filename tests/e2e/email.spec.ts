import { expect, test } from "@playwright/test";
import { acceptConsentIfAsked, login } from "./helpers";
import { E2E_PASSWORD } from "./global-setup";

function sicil(role: "SA" | "HR", projectName: string) {
  return `E2E-${process.env.E2E_SUFFIX}-${role}${projectName[0]}`;
}

test("FG-3.7 karar #261: sistem yöneticisi e-posta durumunu görür; gönderim kapalıyken deneme e-postası gönderilemez", async ({ page }, testInfo) => {
  await login(page, sicil("SA", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto("/admin");
  await page.getByRole("link", { name: /E-posta durumu/ }).click();
  await expect(page).toHaveURL(/\/admin\/email$/);
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { level: 1, name: "E-posta durumu" })).toBeVisible();
  // Testte gönderim kapalı (MAIL_TRANSPORT=log)
  await expect(main.getByRole("heading", { name: "E-posta gönderimi kapalı" })).toBeVisible();
  await expect(main.getByTestId("mail-transport")).toHaveText("Kapalı (yalnızca sunucu kaydı)");
  await expect(main.getByTestId("mail-today")).toBeVisible();
  await expect(main.getByText("E-posta gönderimi kapalıyken deneme e-postası gönderilemez.")).toBeVisible();
  await expect(main.getByRole("button", { name: /Deneme e-postası/ })).toHaveCount(0);
});

test("FG-3.7 karar #259: İK sistem yöneticisinin şifresini sıfırlayamaz; kişi sayfasında düğme yerine açıklama görünür", async ({ page }, testInfo) => {
  const target = sicil("SA", testInfo.project.name);
  await login(page, sicil("HR", testInfo.project.name), E2E_PASSWORD);
  await acceptConsentIfAsked(page);

  await page.goto(`/admin/people?q=${encodeURIComponent(target)}`);
  await page.getByRole("link", { name: new RegExp(`Deneme Sistem Yöneticisi ${testInfo.project.name[0]}`) }).click();
  await expect(page.getByRole("main").getByRole("heading", { level: 1, name: /Deneme Sistem Yöneticisi/ })).toBeVisible();
  await expect(page.getByTestId("reset-blocked")).toHaveText(
    "Sistem yöneticisinin şifresini yalnızca sistem yöneticisi ya da üst yönetici sıfırlayabilir.",
  );
  await expect(page.getByRole("button", { name: "Şifreyi sıfırla" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Davet gönder" })).toHaveCount(0);
});
